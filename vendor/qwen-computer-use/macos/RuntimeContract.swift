import Foundation
import CoreGraphics

struct RuntimeFailure: Error, CustomStringConvertible {
    let description: String
    init(_ message: String) { description = message }
}

// Only the native input boundary owns this fact; activation/preflight is not input.
final class InputDispatchReceipt {
    private(set) var dispatched = false

    func perform<T>(_ operation: () throws -> T) rethrows -> T {
        dispatched = true
        return try operation()
    }

    func failureDescription(_ error: Error) -> String {
        "\(error)" + (dispatched
            ? " Input may have occurred. Observe before retrying; do not replay an uncertain action."
            : " No requested input was dispatched. Observe get_app_state(app=foreground) and use that window's current observation before retrying.")
    }
}

struct NativeWindow {
    let id: CGWindowID
    let pid: pid_t
    let name: String
    let bundle: String
    let title: String
    let bounds: WindowFrame
    var selector: String { "window:\(pid):\(id)" }
}


// Window stacking and keyboard focus differ when an app shows a nonactivating popover.
func matchFocusedWindow(_ candidates: [NativeWindow], pid: pid_t, frame: WindowFrame, title: String) -> NativeWindow? {
    let matches = candidates.filter { $0.pid == pid && $0.bounds.matches(frame) && $0.title == title }
    return matches.count == 1 ? matches.first : nil
}

struct WindowFrame: Codable, Equatable {
    var x: Double
    var y: Double
    var width: Double
    var height: Double

    init(_ rect: CGRect) {
        x = rect.minX; y = rect.minY; width = rect.width; height = rect.height
    }
    var rect: CGRect { CGRect(x: x, y: y, width: width, height: height) }
    func matches(_ other: WindowFrame) -> Bool {
        zip([x, y, width, height], [other.x, other.y, other.width, other.height])
            .allSatisfy { pair in abs(pair.0 - pair.1) < 0.5 }
    }
    func globalPoint(x localX: Double?, y localY: Double?) throws -> CGPoint {
        guard let localX, let localY, localX.isFinite, localY.isFinite,
              localX >= 0, localY >= 0, localX < width, localY < height else {
            throw RuntimeFailure("Coordinates must be inside the observed screenshot.")
        }
        return CGPoint(x: x + localX, y: y + localY)
    }
}

struct NativeElement: Codable {
    var index: Int
    var runtimeId: [Int]
    var automationId: String
    var name: String
    var controlType: String
    var value: String
    var frame: WindowFrame?
    var actions: [String]

    func matches(_ current: NativeElement) -> Bool {
        runtimeId == current.runtimeId && automationId == current.automationId
            && name == current.name && controlType == current.controlType
            && value == current.value && frame == current.frame
    }
}

struct NativeRequest: Decodable {
    var tool: String
    var app: String?
    var expectedWindow: UInt32?
    var expectedPid: Int32?
    var windowBounds: WindowFrame?
    var element: NativeElement?
    var x: Double?
    var y: Double?
    var from_x: Double?
    var from_y: Double?
    var to_x: Double?
    var to_y: Double?
    var click_count: Int?
    var mouse_button: String?
    var direction: String?
    var pages: Double?
    var text: String?
    var key: String?
    var value: String?
    var action: String?

    // Go's established omitempty wire format omits value when clearing text.
    // Numeric controls still require a finite number; empty is not zero.
    func accessibilityValue(isNumeric: Bool) throws -> NSObject {
        let text = value ?? ""
        if isNumeric {
            guard let number = Double(text), number.isFinite else {
                throw RuntimeFailure("This control requires a finite numeric value.")
            }
            return NSNumber(value: number)
        }
        return text as NSString
    }

    var requiresKeyboardFocus: Bool { tool == "press_key" || tool == "type_text" }

    var isInput: Bool { tool != "get_app_state" && tool != "list_apps" && tool != "doctor" }
    func validateBinding(pid: Int32, window: UInt32, bounds: WindowFrame) throws {
        if let expectedPid, expectedPid != pid { throw RuntimeFailure("Window owner changed; re-observe.") }
        if let expectedWindow, expectedWindow != window { throw RuntimeFailure("Window identity changed; re-observe.") }
        if isInput {
            guard expectedPid == pid, expectedWindow == window, let windowBounds,
                  windowBounds.matches(bounds) else {
                throw RuntimeFailure("Input requires the current observed window and unchanged bounds.")
            }
        }
    }
}

// Go omits empty optional properties; preserve that wire contract on macOS.
extension NativeElement {
    init(from decoder: Decoder) throws {
        let fields = try decoder.container(keyedBy: CodingKeys.self)
        index = try fields.decode(Int.self, forKey: .index)
        runtimeId = try fields.decode([Int].self, forKey: .runtimeId)
        automationId = try fields.decodeIfPresent(String.self, forKey: .automationId) ?? ""
        name = try fields.decodeIfPresent(String.self, forKey: .name) ?? ""
        controlType = try fields.decodeIfPresent(String.self, forKey: .controlType) ?? ""
        value = try fields.decodeIfPresent(String.self, forKey: .value) ?? ""
        frame = try fields.decodeIfPresent(WindowFrame.self, forKey: .frame)
        actions = try fields.decodeIfPresent([String].self, forKey: .actions) ?? []
    }
}

func keySpec(_ chord: String) throws -> (CGKeyCode, CGEventFlags) {
    let parts = chord.lowercased().split(separator: "+", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
    guard let last = parts.last, !parts.contains("") else { throw RuntimeFailure("Empty key in chord.") }
    let key = last.hasPrefix("numpad_") ? "kp_" + last.dropFirst(7) : last
    var flags: CGEventFlags = []
    for modifier in parts.dropLast() {
        switch modifier {
        case "cmd", "command", "super", "win", "meta", "super_l", "super_r": flags.insert(.maskCommand)
        case "ctrl", "control", "control_l", "control_r": flags.insert(.maskControl)
        case "alt", "option", "alt_l", "alt_r": flags.insert(.maskAlternate)
        case "shift", "shift_l", "shift_r": flags.insert(.maskShift)
        default: throw RuntimeFailure("Unknown key modifier: \(modifier)")
        }
    }
    let codes: [String: CGKeyCode] = ["a":0,"s":1,"d":2,"f":3,"h":4,"g":5,"z":6,"x":7,"c":8,"v":9,"b":11,"q":12,"w":13,"e":14,"r":15,"y":16,"t":17,"1":18,"2":19,"3":20,"4":21,"6":22,"5":23,"equal":24,"9":25,"7":26,"minus":27,"8":28,"0":29,"o":31,"u":32,"i":34,"p":35,"enter":36,"return":36,"l":37,"j":38,"k":40,"n":45,"m":46,"tab":48,"space":49,"backspace":51,"escape":53,"esc":53,"home":115,"pageup":116,"delete":117,"end":119,"pagedown":121,"left":123,"right":124,"down":125,"up":126,"f1":122,"f2":120,"f3":99,"f4":118,"f5":96,"f6":97,"f7":98,"f8":100,"f9":101,"f10":109,"f11":103,"f12":111]
    let additional: [String: CGKeyCode] = ["bracketright":30,"bracketleft":33,"apostrophe":39,"semicolon":41,"backslash":42,"comma":43,"slash":44,"period":47,"grave":50,"kp_decimal":65,"kp_multiply":67,"kp_add":69,"kp_divide":75,"kp_enter":76,"kp_subtract":78,"kp_equal":81,"kp_0":82,"kp_1":83,"kp_2":84,"kp_3":85,"kp_4":86,"kp_5":87,"kp_6":88,"kp_7":89,"kp_8":91,"kp_9":92,"f13":105,"f14":107,"f15":113,"f16":106,"f17":64,"f18":79,"f19":80,"f20":90,"page_up":116,"page_down":121]
    let shifted: [String: CGKeyCode] = ["plus":24,"underscore":27,"colon":41,"quotedbl":39,"question":44,"greater":47,"less":43,"asciitilde":50,"braceleft":33,"braceright":30,"bar":42,"exclam":18,"at":19,"numbersign":20,"dollar":21,"percent":23,"asciicircum":22,"ampersand":26,"asterisk":28,"parenleft":25,"parenright":29]
    guard let code = codes[key] ?? additional[key] ?? shifted[key] else { throw RuntimeFailure("Unsupported key; use type_text for text, or a named special key.") }
    if shifted[key] != nil { flags.insert(.maskShift) }
    return (code, flags)
}

// Requesting access is not itself a grant. Always recheck OS state afterwards.
func requestMissingPermission(check: () -> Bool, request: () -> Void) -> Bool {
    if check() { return true }
    request()
    return check()
}

struct PermissionApplication {
    let name: String
    let identifier: String
    let path: String

    static func locate(executable: URL, bundleInfo: (URL) -> [String: Any]?) -> PermissionApplication {
        var directory = executable.deletingLastPathComponent()
        while directory.path != "/" {
            if directory.pathExtension == "app", let info = bundleInfo(directory) {
                return PermissionApplication(
                    name: info["CFBundleDisplayName"] as? String ?? info["CFBundleName"] as? String ?? directory.deletingPathExtension().lastPathComponent,
                    identifier: info["CFBundleIdentifier"] as? String ?? "unknown",
                    path: directory.path)
            }
            directory.deleteLastPathComponent()
        }
        return PermissionApplication(name: executable.lastPathComponent, identifier: "standalone helper", path: executable.path)
    }

    func denied(_ permission: String) -> String {
        "macOS \(permission) access is still unavailable to the current process after requesting system authorization. Current application: \(name) (\(identifier)); path: \(path). Confirm the macOS prompt or select this exact application in System Settings > Privacy & Security > \(permission), then restart this application and retry. An enabled entry for a different application or an older installed copy does not verify access for this process. If the switch is already on, verify the application identity/path and restart before requesting another change. No desktop input was dispatched."
    }
}

// Read-only prerequisites; does not grant input permission or prove acceptance.
struct DesktopEnvironmentDiagnostic {
    let onConsole: Bool
    let loginDone: Bool
    let sameUser: Bool
    let lockSignal: String
    let accessibility: Bool
    let screenRecording: Bool

    init(session: [String: Any]?, userID: UInt32, accessibility: Bool, screenRecording: Bool) {
        onConsole = session?[kCGSessionOnConsoleKey as String] as? Bool == true
        loginDone = session?[kCGSessionLoginDoneKey as String] as? Bool == true
        sameUser = (session?[kCGSessionUserIDKey as String] as? NSNumber)?.uint32Value == userID
        // This additional OS signal is used by Chromium, but is not a public
        // CoreGraphics constant. Absence is reported, never called "unlocked".
        // Public session prerequisites and per-action target checks still apply.
        if let raw = session?["CGSSessionScreenIsLocked"] {
            if let locked = raw as? Bool { lockSignal = locked ? "locked" : "unlocked" }
            else { lockSignal = "invalid" }
        } else { lockSignal = "notReported" }
        self.accessibility = accessibility
        self.screenRecording = screenRecording
    }

    var desktopAvailable: Bool {
        onConsole && loginDone && sameUser && lockSignal != "locked" && lockSignal != "invalid"
    }
    var permissionAvailable: Bool { accessibility && screenRecording }
    var dictionary: [String: Any] {
        ["schemaVersion": 1, "platform": "macos",
         "desktopAvailable": desktopAvailable, "permissionAvailable": permissionAvailable,
         "onConsole": onConsole, "loginDone": loginDone, "sameUser": sameUser,
         "lockSignal": lockSignal, "accessibility": accessibility, "screenRecording": screenRecording]
    }
}
