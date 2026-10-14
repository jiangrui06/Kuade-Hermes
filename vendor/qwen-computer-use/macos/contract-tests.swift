import Foundation
import CoreGraphics

@main
struct ContractTests {
    static func require(_ value: Bool, _ message: String) throws {
        if !value { throw RuntimeFailure(message) }
    }
    static func rejects(_ work: () throws -> Void) throws {
        do { try work() } catch is RuntimeFailure { return }
        throw RuntimeFailure("Invalid input was accepted")
    }
    static func main() throws {
        let input = InputDispatchReceipt()
        try rejects { throw RuntimeFailure("Foreground window changed") }
        try require(!input.dispatched, "Preflight failure was reported as input")
        try require(input.failureDescription(RuntimeFailure("Covered point")).contains("No requested input was dispatched"), "Known non-dispatch reported as uncertain")
        try rejects { try input.perform { throw RuntimeFailure("Native operation failed after dispatch") } }
        try require(input.dispatched && input.failureDescription(RuntimeFailure("After-state unavailable")).contains("Input may have occurred"), "Partial dispatch lost its uncertainty")
        print("Input receipt: preflight and uncertain native dispatch distinguished.")
        let mainWindow = NativeWindow(id: 575, pid: 76632, name: "WeChat", bundle: "com.tencent.xinWeChat", title: "微信", bounds: WindowFrame(CGRect(x: 273, y: 156, width: 880, height: 640)))
        let popover = NativeWindow(id: 772, pid: 76632, name: "WeChat", bundle: "com.tencent.xinWeChat", title: "", bounds: WindowFrame(CGRect(x: 321, y: 191, width: 368, height: 96)))
        try require(matchFocusedWindow([popover, mainWindow], pid: 76632, frame: mainWindow.bounds, title: "微信")?.id == 575, "Search popover stole keyboard focus solely due to stacking order")
        try require(matchFocusedWindow([popover, mainWindow], pid: 76632, frame: popover.bounds, title: "")?.id == 772, "A genuinely focused popup was ignored")
        try require(matchFocusedWindow([mainWindow, mainWindow], pid: 76632, frame: mainWindow.bounds, title: "微信") == nil, "Ambiguous focus identity was accepted")
        try require(matchFocusedWindow([mainWindow], pid: 123, frame: mainWindow.bounds, title: "微信") == nil, "Focus crossed process identity")
        print("Focus contract: nonactivating popover, focused dialog, ambiguity and process isolation passed.")
        var granted = true
        var prompts = 0
        try require(requestMissingPermission(check: { granted }, request: { prompts += 1 }), "Existing grant rejected")
        try require(prompts == 0, "Already granted permission prompted again")
        granted = false
        try require(!requestMissingPermission(check: { granted }, request: { prompts += 1 }), "A prompt was treated as a grant")
        try require(prompts == 1, "Missing permission did not request authorization")
        try require(requestMissingPermission(check: { granted }, request: { prompts += 1; granted = true }), "New OS grant was not rechecked")
        let mounted = URL(fileURLWithPath: "/Volumes/CodeBuddy/CodeBuddy.app/Contents/Resources/bin/qwen-computer-runtime")
        let current = PermissionApplication.locate(executable: mounted, bundleInfo: { url in
            url.path == "/Volumes/CodeBuddy/CodeBuddy.app" ? ["CFBundleName": "CodeBuddy", "CFBundleIdentifier": "local.codebuddy.desktop"] : nil
        })
        try require(current.identifier == "local.codebuddy.desktop" && current.path == "/Volumes/CodeBuddy/CodeBuddy.app", "Permission guidance used the wrong application identity")
        try require(current.denied("Screen Recording").contains(current.path), "Permission failure omitted the exact application path")
        let standalone = PermissionApplication.locate(executable: URL(fileURLWithPath: "/tmp/qwen-computer-runtime"), bundleInfo: { _ in nil })
        try require(standalone.path == "/tmp/qwen-computer-runtime" && standalone.identifier == "standalone helper", "Standalone helper impersonated an installed application")
        let session: [String: Any] = [kCGSessionOnConsoleKey as String: true,
            kCGSessionLoginDoneKey as String: true, kCGSessionUserIDKey as String: NSNumber(value: 501)]
        func diagnostic(_ value: [String: Any]?, ax: Bool = true, screen: Bool = true) -> DesktopEnvironmentDiagnostic {
            DesktopEnvironmentDiagnostic(session: value, userID: 501, accessibility: ax, screenRecording: screen)
        }
        let ready = diagnostic(session)
        try require(ready.desktopAvailable && ready.permissionAvailable && ready.lockSignal == "notReported", "Ready desktop rejected or missing lock signal misrepresented")
        try require(!diagnostic(nil).desktopAvailable, "Missing Quartz session accepted")
        for (key, value) in [(kCGSessionOnConsoleKey as String, false as Any),
            (kCGSessionLoginDoneKey as String, false as Any),
            (kCGSessionUserIDKey as String, NSNumber(value: 502) as Any),
            ("CGSSessionScreenIsLocked", true as Any),
            ("CGSSessionScreenIsLocked", "invalid" as Any)] {
            var altered = session; altered[key] = value
            try require(!diagnostic(altered).desktopAvailable, "Unavailable session accepted: \(key)")
        }
        try require(!diagnostic(session, ax: false).permissionAvailable, "Missing AX permission accepted")
        try require(!diagnostic(session, screen: false).permissionAvailable, "Missing screen permission accepted")
        print("Desktop environment contract: 9 checks passed; no desktop input or permission request.")
        let data = Data(#"{"tool":"click","app":"window:71:902","expectedPid":71,"expectedWindow":902,"windowBounds":{"x":-500,"y":30,"width":640,"height":480},"element":{"index":4,"runtimeId":[0,2],"controlType":"AXButton"}}"#.utf8)
        let request = try JSONDecoder().decode(NativeRequest.self, from: data)
        let bounds = WindowFrame(CGRect(x: -500, y: 30, width: 640, height: 480))
        try request.validateBinding(pid: 71, window: 902, bounds: bounds)
        try require(request.element?.name == "" && request.element?.actions == [], "Go omitted fields did not decode")
        try require(bounds.globalPoint(x: 20, y: 40) == CGPoint(x: -480, y: 70), "Secondary display coordinate conversion changed")
        try rejects { _ = try bounds.globalPoint(x: -1, y: 0) }
        try rejects { _ = try bounds.globalPoint(x: 640, y: 0) }
        try rejects { _ = try bounds.globalPoint(x: .nan, y: 0) }
        try rejects { try request.validateBinding(pid: 72, window: 902, bounds: bounds) }
        try rejects { try request.validateBinding(pid: 71, window: 903, bounds: bounds) }
        try rejects { try request.validateBinding(pid: 71, window: 902, bounds: WindowFrame(CGRect(x: 0, y: 30, width: 640, height: 480))) }
        let unbound = try JSONDecoder().decode(NativeRequest.self, from: Data(#"{"tool":"type_text","text":"中文🙂"}"#.utf8))
        try rejects { try unbound.validateBinding(pid: 71, window: 902, bounds: bounds) }
        var changed = request.element!
        changed.name = "different recipient"
        try require(!request.element!.matches(changed), "Recycled element identity was accepted")
        let chord = try keySpec("Control_L+Shift_R+Return")
        try require(chord.0 == 36 && chord.1 == [.maskControl, .maskShift], "X11 modifier aliases differ from Windows")
        let command = try keySpec("Super_L+c")
        try require(command.0 == 8 && command.1 == .maskCommand, "Super must map to macOS Command")
        let plus = try keySpec("plus")
        let keypad = try keySpec("Numpad_Add")
        try require(plus.0 == 24 && plus.1 == .maskShift, "Main keyboard plus requires Shift")
        try require(keypad.0 == 69 && keypad.1.isEmpty, "Keypad plus must remain distinct")
        try rejects { _ = try keySpec("typo+a") }
        try rejects { _ = try keySpec("ctrl++a") }
        try rejects { _ = try keySpec("") }
        // The empty request is exactly the JSON produced by Go psRequest.Value omitempty.
        func valueRequest(_ value: String?) throws -> NativeRequest {
            var object: [String: Any] = ["tool": "set_value", "element": ["index": 4, "runtimeId": [0, 2]]]
            if let value { object["value"] = value }
            return try JSONDecoder().decode(NativeRequest.self, from: JSONSerialization.data(withJSONObject: object))
        }
        let clear = try valueRequest(nil)
        try require(clear.accessibilityValue(isNumeric: false) == NSString(string: ""), "Go omitted empty text must clear the control")
        try require(valueRequest("").accessibilityValue(isNumeric: false) == NSString(string: ""), "Explicit empty text must clear the control")
        try require(valueRequest("中文🙂\n ").accessibilityValue(isNumeric: false) == NSString(string: "中文🙂\n "), "Text value must preserve Unicode and whitespace")
        try require(valueRequest("12.5").accessibilityValue(isNumeric: true) == NSNumber(value: 12.5), "Numeric control value changed")
        try require(valueRequest("0").accessibilityValue(isNumeric: true) == NSNumber(value: 0), "Numeric zero rejected")
        for value in [nil, "", "abc", "nan", "inf", "1e999"] as [String?] {
            try rejects { _ = try valueRequest(value).accessibilityValue(isNumeric: true) }
        }
        print("set_value contract: 11 checks passed (omitted/explicit empty, Unicode, numeric values and invalid-number rejection).")
        print("Native contract checks passed: omitted fields, Unicode, coordinates, process/window/geometry element binding, and keyboard aliases.")
    }
}
