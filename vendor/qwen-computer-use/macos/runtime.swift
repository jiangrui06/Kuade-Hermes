import AppKit
import ApplicationServices
import ScreenCaptureKit

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var result: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &result) == .success ? result : nil
}

func textAttribute(_ element: AXUIElement, _ name: String) -> String {
    if let value = attribute(element, name) as? String { return value }
    if let value = attribute(element, name) as? NSNumber { return value.stringValue }
    return ""
}

func elementRect(_ element: AXUIElement) -> CGRect? {
    guard let p = attribute(element, kAXPositionAttribute), let s = attribute(element, kAXSizeAttribute),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &point),
          AXValueGetValue(s as! AXValue, .cgSize, &size) else { return nil }
    return CGRect(origin: point, size: size)
}

func actions(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    guard AXUIElementCopyActionNames(element, &names) == .success else { return [] }
    return names as? [String] ?? []
}

func record(_ element: AXUIElement, path: [Int], index: Int, window: NativeWindow) -> NativeElement {
    let title = textAttribute(element, kAXTitleAttribute)
    let description = textAttribute(element, kAXDescriptionAttribute)
    let local = elementRect(element).map {
        WindowFrame($0.offsetBy(dx: -window.bounds.x, dy: -window.bounds.y))
    }
    return NativeElement(index: index, runtimeId: path,
        automationId: textAttribute(element, kAXIdentifierAttribute),
        name: title.isEmpty ? description : title,
        controlType: textAttribute(element, kAXRoleAttribute),
        value: textAttribute(element, kAXValueAttribute), frame: local, actions: actions(element))
}

@MainActor
func windows() -> [NativeWindow] {
    let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
    return (info as? [[String: Any]] ?? []).compactMap { row in
        // Include visible menus/dialogs as separate targets, not only layer-zero
        // document windows. Otherwise an overlay could receive a stale click.
        guard (row[kCGWindowAlpha as String] as? Double ?? 1) > 0,
              let pid = row[kCGWindowOwnerPID as String] as? Int32,
              let id = row[kCGWindowNumber as String] as? UInt32, pid > 0, id > 0,
              let box = row[kCGWindowBounds as String] as? [String: Any],
              let rect = CGRect(dictionaryRepresentation: box as CFDictionary),
              rect.width > 1, rect.height > 1 else { return nil }
        let app = NSRunningApplication(processIdentifier: pid)
        return NativeWindow(id: id, pid: pid,
            name: app?.localizedName ?? (row[kCGWindowOwnerName as String] as? String ?? ""),
            bundle: app?.bundleIdentifier ?? "", title: row[kCGWindowName as String] as? String ?? "",
            bounds: WindowFrame(rect))
    }
}

@MainActor
func focusedWindow(pid: pid_t, candidates: [NativeWindow]) -> NativeWindow? {
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 1)
    guard let value = attribute(app, kAXFocusedWindowAttribute),
          CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    let focused = value as! AXUIElement
    guard let rect = elementRect(focused) else { return nil }
    return matchFocusedWindow(candidates, pid: pid, frame: WindowFrame(rect), title: textAttribute(focused, kAXTitleAttribute))
}

@MainActor
func resolve(_ request: NativeRequest) throws -> NativeWindow {
    let all = windows()
    if let id = request.expectedWindow, let pid = request.expectedPid {
        guard let exact = all.first(where: { $0.id == id && $0.pid == pid }) else {
            throw RuntimeFailure("Observed window disappeared or changed owner. Run list_apps and re-observe.")
        }
        return exact
    }
    let query = (request.app ?? "").lowercased()
    if query == "foreground" {
        guard let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier,
              let front = focusedWindow(pid: pid, candidates: all) ?? all.first(where: { $0.pid == pid }) else { throw RuntimeFailure("No foreground window.") }
        return front
    }
    let matches = all.filter {
        [$0.selector, $0.name, $0.bundle, $0.title, String($0.pid)].contains { $0.lowercased() == query }
    }
    guard matches.count == 1, let selected = matches.first else {
        throw RuntimeFailure("Target is absent or ambiguous. Use an exact window:PID:WINDOW_ID from list_apps.")
    }
    return selected
}

func accessibilityWindow(_ window: NativeWindow) throws -> AXUIElement {
    let app = AXUIElementCreateApplication(window.pid)
    AXUIElementSetMessagingTimeout(app, 1)
    let candidates = (attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? []).filter {
        guard let rect = elementRect($0) else { return false }
        return WindowFrame(rect).matches(window.bounds) && textAttribute($0, kAXTitleAttribute) == window.title
    }
    guard candidates.count == 1, let root = candidates.first else {
        throw RuntimeFailure("Accessibility window identity is ambiguous or unavailable; re-observe after the app is ready.")
    }
    return root
}

@MainActor
func snapshot(_ window: NativeWindow) async throws -> [String: Any] {
    let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
    guard let target = content.windows.first(where: { $0.windowID == window.id && $0.owningApplication?.processID == window.pid }),
          WindowFrame(target.frame).matches(window.bounds) else {
        throw RuntimeFailure("Window changed during observation; re-observe.")
    }
    let config = SCStreamConfiguration()
    // Output one pixel per global coordinate point, including Retina displays.
    config.width = Int(window.bounds.width.rounded())
    config.height = Int(window.bounds.height.rounded())
    config.showsCursor = false
    config.ignoreShadowsSingleWindow = true
    let image = try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(desktopIndependentWindow: target), configuration: config)
    guard let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
        throw RuntimeFailure("Failed to encode the current window image.")
    }
    var elements: [NativeElement] = []
    var lines: [String] = []
    if let root = try? accessibilityWindow(window) {
        let deadline = Date().addingTimeInterval(3)
        func visit(_ item: AXUIElement, path: [Int], depth: Int) {
            guard depth < 20, elements.count < 400, Date() < deadline else { return }
            let node = record(item, path: path, index: elements.count, window: window)
            elements.append(node)
            lines.append("\(node.index) \(node.controlType) \(node.name.debugDescription) value=\(node.value.debugDescription) actions=\(node.actions)")
            for (index, child) in (attribute(item, kAXChildrenAttribute) as? [AXUIElement] ?? []).enumerated() {
                visit(child, path: path + [index], depth: depth + 1)
            }
        }
        visit(root, path: [0], depth: 0)
        if elements.count >= 400 || Date() >= deadline { lines.append("Accessibility tree truncated; use visible image coordinates where needed.") }
    } else {
        lines.append("Accessibility tree unavailable. Use coordinates bound to this window screenshot.")
    }
    // Reject geometry changes while the image/tree were being collected.
    guard windows().contains(where: { $0.id == window.id && $0.pid == window.pid && $0.bounds.matches(window.bounds) }) else {
        throw RuntimeFailure("Window changed while collecting its image and tree; re-observe.")
    }
    let encoded = try JSONEncoder().encode(elements)
    let bounds = try JSONEncoder().encode(window.bounds)
    var result: [String: Any] = [
        "app": ["name": window.name, "bundleIdentifier": window.bundle, "pid": window.pid],
        "windowHandle": window.id, "windowTitle": window.title,
        "windowBounds": try JSONSerialization.jsonObject(with: bounds),
        "screenshotPngBase64": png.base64EncodedString(), "treeLines": lines,
        "elements": try JSONSerialization.jsonObject(with: encoded)
    ]
    if let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier,
       let front = focusedWindow(pid: pid, candidates: windows()) ?? windows().first(where: { $0.pid == pid }) {
        result["foreground"] = ["name": front.name, "pid": front.pid, "windowHandle": front.id, "title": front.title]
    }
    return result
}

func lookup(_ expected: NativeElement, in window: NativeWindow) throws -> AXUIElement {
    guard expected.runtimeId.first == 0 else { throw RuntimeFailure("Unknown accessibility element identity.") }
    var current = try accessibilityWindow(window)
    for index in expected.runtimeId.dropFirst() {
        let children = attribute(current, kAXChildrenAttribute) as? [AXUIElement] ?? []
        guard children.indices.contains(index) else { throw RuntimeFailure("Element disappeared; re-observe.") }
        current = children[index]
    }
    guard expected.matches(record(current, path: expected.runtimeId, index: expected.index, window: window)) else {
        throw RuntimeFailure("Element changed since observation; re-observe before input.")
    }
    return current
}

@MainActor
func assertForeground(_ window: NativeWindow, keyboard: Bool = false) throws {
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == window.pid,
          !keyboard || focusedWindow(pid: window.pid, candidates: windows())?.id == window.id else {
        throw RuntimeFailure("Foreground window changed; observe the active window before retrying.")
    }
}

@MainActor
func mouse(_ type: CGEventType, _ point: CGPoint, _ button: CGMouseButton = .left, count: Int = 1, receipt: InputDispatchReceipt) throws {
    guard let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button) else {
        throw RuntimeFailure("Failed to create mouse input.")
    }
    event.setIntegerValueField(.mouseEventClickState, value: Int64(count))
    receipt.perform { event.post(tap: .cghidEventTap) }
}


@main
struct NativeRuntime {
    @MainActor static func main() async {
        let receipt = InputDispatchReceipt()
        do {
            NSApplication.shared.setActivationPolicy(.prohibited)
            let input = FileHandle.standardInput.readDataToEndOfFile()
            let request = try JSONDecoder().decode(NativeRequest.self, from: input)
            if request.tool == "doctor" {
                let diagnostic = DesktopEnvironmentDiagnostic(
                session: CGSessionCopyCurrentDictionary() as? [String: Any], userID: getuid(),
                accessibility: AXIsProcessTrusted(), screenRecording: CGPreflightScreenCaptureAccess())
            try emit(["ok": true, "desktopEnvironment": diagnostic.dictionary,
                "text": "macOS runtime available. Desktop=\(diagnostic.desktopAvailable), Accessibility=\(diagnostic.accessibility), ScreenRecording=\(diagnostic.screenRecording), LockSignal=\(diagnostic.lockSignal)."])
                return
            }
            let permissionApplication = PermissionApplication.locate(
                executable: Bundle.main.executableURL ?? URL(fileURLWithPath: CommandLine.arguments[0]),
                bundleInfo: { Bundle(url: $0)?.infoDictionary })
            guard requestMissingPermission(check: { CGPreflightScreenCaptureAccess() },
                request: { _ = CGRequestScreenCaptureAccess() }) else {
                throw RuntimeFailure(permissionApplication.denied("Screen Recording"))
            }
            if request.tool == "list_apps" {
                try emit(["ok": true, "text": windows().map { "\($0.selector) \($0.name) \($0.title.debugDescription)" }.joined(separator: "\n")])
                return
            }
            let window = try resolve(request)
            try request.validateBinding(pid: window.pid, window: window.id, bounds: window.bounds)
            if request.isInput {
                guard ProcessInfo.processInfo.environment["OPEN_COMPUTER_USE_WINDOWS_FOREGROUND_INPUT"] == "1" else {
                    throw RuntimeFailure("macOS input requires --foreground-input.")
                }
                guard requestMissingPermission(check: { AXIsProcessTrusted() }, request: {
                    _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
                }) else {
                    throw RuntimeFailure(permissionApplication.denied("Accessibility"))
                }
                _ = try request.element.map { try lookup($0, in: window) }
                guard let app = NSRunningApplication(processIdentifier: window.pid) else { throw RuntimeFailure("Target process exited.") }
                // Activation can change focus but is not the requested keyboard/mouse input.
                if NSWorkspace.shared.frontmostApplication?.processIdentifier != window.pid
                    || (request.requiresKeyboardFocus && focusedWindow(pid: window.pid, candidates: windows())?.id != window.id) {
                    app.activate(options: [.activateIgnoringOtherApps])
                    if let root = try? accessibilityWindow(window) { AXUIElementPerformAction(root, kAXRaiseAction as CFString) }
                    try await Task.sleep(nanoseconds: 150_000_000)
                }
                try assertForeground(window, keyboard: request.requiresKeyboardFocus)
                guard let current = windows().first(where: { $0.id == window.id && $0.pid == window.pid }) else { throw RuntimeFailure("Window closed during activation.") }
                try request.validateBinding(pid: current.pid, window: current.id, bounds: current.bounds)
                let element = try request.element.map { try lookup($0, in: current) }
                try await inputAction(request, window: current, element: element, receipt: receipt)
                try await Task.sleep(nanoseconds: 120_000_000)
            }
            let after = try resolve(request)
            try emit(["ok": true, "actionDispatched": receipt.dispatched, "snapshot": try await snapshot(after)])
        } catch {
            try? emit(["ok": false, "actionDispatched": receipt.dispatched,
                "error": receipt.failureDescription(error)])
        }
    }

    static func emit(_ object: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
    }

    @MainActor static func inputAction(_ request: NativeRequest, window: NativeWindow, element: AXUIElement?, receipt: InputDispatchReceipt) async throws {
        func point() throws -> CGPoint {
            if let frame = request.element?.frame {
                return try window.bounds.globalPoint(x: frame.x + frame.width / 2, y: frame.y + frame.height / 2)
            }
            return try window.bounds.globalPoint(x: request.x, y: request.y)
        }
        func visiblePoint(_ point: CGPoint) throws {
            // Input targets the live desktop, so a covering window must not receive it.
            guard windows().first(where: { $0.bounds.rect.contains(point) })?.id == window.id else {
                throw RuntimeFailure("Another window covers the input point; re-observe.")
            }
        }
        switch request.tool {
        case "click":
            let p = try point(); try visiblePoint(p)
            let count = request.click_count ?? 1
            guard (1...3).contains(count) else { throw RuntimeFailure("click_count must be 1, 2, or 3.") }
            let button: CGMouseButton
            let down: CGEventType
            let up: CGEventType
            switch request.mouse_button ?? "left" {
            case "left": button = .left; down = .leftMouseDown; up = .leftMouseUp
            case "right": button = .right; down = .rightMouseDown; up = .rightMouseUp
            case "middle": button = .center; down = .otherMouseDown; up = .otherMouseUp
            default: throw RuntimeFailure("Unsupported mouse button.")
            }
            for n in 1...count {
                try assertForeground(window)
                try visiblePoint(p)
                try mouse(down, p, button, count: n, receipt: receipt)
                try mouse(up, p, button, count: n, receipt: receipt)
            }
        case "drag":
            let start = try window.bounds.globalPoint(x: request.from_x, y: request.from_y)
            let end = try window.bounds.globalPoint(x: request.to_x, y: request.to_y)
            try visiblePoint(start); try visiblePoint(end)
            try mouse(.leftMouseDown, start, receipt: receipt)
            defer { try? mouse(.leftMouseUp, end, receipt: receipt) }
            for step in 1...20 {
                try assertForeground(window)
                let p = CGPoint(x: start.x + (end.x - start.x) * Double(step) / 20,
                                y: start.y + (end.y - start.y) * Double(step) / 20)
                try mouse(.leftMouseDragged, p, receipt: receipt)
                try await Task.sleep(nanoseconds: 10_000_000)
            }
        case "scroll":
            let p = try point(); try visiblePoint(p)
            let pages = request.pages ?? 1
            guard pages.isFinite, pages > 0, pages <= 100 else { throw RuntimeFailure("Scroll pages must be finite and between 0 and 100.") }
            let vertical: Int32
            let horizontal: Int32
            let amount = Int32(min(100_000, max(1, (pages * window.bounds.height * 0.8).rounded())))
            switch request.direction {
            case "up": vertical = amount; horizontal = 0
            case "down": vertical = -amount; horizontal = 0
            case "left": vertical = 0; horizontal = amount
            case "right": vertical = 0; horizontal = -amount
            default: throw RuntimeFailure("Unknown scroll direction.")
            }
            try mouse(.mouseMoved, p, receipt: receipt)
            guard let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: vertical, wheel2: horizontal, wheel3: 0) else { throw RuntimeFailure("Failed to create scroll input.") }
            event.location = p
            receipt.perform { event.post(tap: .cghidEventTap) }
        case "press_key":
            try assertForeground(window, keyboard: true)
            let (code, flags) = try keySpec(request.key ?? "")
            guard let down = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true),
                  let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false) else { throw RuntimeFailure("Failed to create key input.") }
            down.flags = flags; up.flags = flags
            receipt.perform { down.post(tap: .cghidEventTap); up.post(tap: .cghidEventTap) }
        case "type_text":
            for character in request.text ?? "" {
                try assertForeground(window, keyboard: true)
                let units = Array(String(character).utf16)
                guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
                      let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else { throw RuntimeFailure("Failed to create text input.") }
                units.withUnsafeBufferPointer { buffer in
                    down.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: buffer.baseAddress!)
                    up.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: buffer.baseAddress!)
                }
                receipt.perform { down.post(tap: .cghidEventTap); up.post(tap: .cghidEventTap) }
                try await Task.sleep(nanoseconds: 1_000_000)
            }
        case "set_value":
            guard let element else { throw RuntimeFailure("set_value requires an observed element.") }
            var settable = DarwinBoolean(false)
            guard AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable) == .success, settable.boolValue else { throw RuntimeFailure("The observed element has no settable value.") }
            let typed = try request.accessibilityValue(isNumeric: attribute(element, kAXValueAttribute) is NSNumber)
            let result = receipt.perform { AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, typed) }
            guard result == .success else { throw RuntimeFailure("Setting value failed: \(result.rawValue)") }
        case "perform_secondary_action":
            guard let element, let requested = request.action else { throw RuntimeFailure("An observed element and advertised action are required.") }
            let action = requested == "Raise" ? kAXRaiseAction : requested
            guard actions(element).contains(action) else { throw RuntimeFailure("Action is not advertised by the current element.") }
            let result = receipt.perform { AXUIElementPerformAction(element, action as CFString) }
            guard result == .success else { throw RuntimeFailure("Accessibility action failed: \(result.rawValue)") }
        default: throw RuntimeFailure("Unsupported input tool: \(request.tool)")
        }
    }
}
