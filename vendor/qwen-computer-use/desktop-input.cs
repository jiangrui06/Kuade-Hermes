using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading;
using System.Text;

// Foreground input is opt-in; all coordinates use physical desktop pixels.
public static class OcuDesktop {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct Mouse { public int dx, dy; public uint data, flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct Keyboard { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] struct Union { [FieldOffset(0)] public Mouse mouse; [FieldOffset(0)] public Keyboard key; }
    [StructLayout(LayoutKind.Sequential)] struct Input { public uint type; public Union data; }
    [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, Input[] inputs, int size);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr window);
    [DllImport("user32.dll", SetLastError=true)] static extern bool AttachThreadInput(uint source, uint target, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    delegate bool EnumWindowProc(IntPtr window, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowProc callback, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumWindowProc callback, IntPtr data);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int size);

    public static IntPtr[] VisibleWindows() {
        var windows=new List<IntPtr>();
        EnumWindows(delegate(IntPtr window,IntPtr ignored) {
            if (WindowVisible(window) && (GetWindowLong(window,-20)&0x80)==0 && Title(window).Length>0) windows.Add(window);
            return true;
        },IntPtr.Zero);
        return windows.ToArray();
    }
    public static IntPtr ForegroundWindow() { return GetForegroundWindow(); }
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out uint value, int size);
    public static bool WindowVisible(IntPtr window) {
        if (!IsWindowVisible(window)) return false;
        // A cloaked UWP window can retain WS_VISIBLE and cached PrintWindow pixels.
        uint cloaked;
        return DwmGetWindowAttribute(window,14,out cloaked,4)>=0 && cloaked==0;
    }
    public static uint WindowProcessId(IntPtr window) { uint pid; GetWindowThreadProcessId(window, out pid); return pid; }
    public static bool BelongsToProcess(IntPtr window, int process) {
        uint actual; return window!=IntPtr.Zero && GetWindowThreadProcessId(window,out actual)!=0 && actual==(uint)process;
    }
    public static string Title(IntPtr window) {
        var title=new StringBuilder(1024); GetWindowText(window,title,title.Capacity); return title.ToString();
    }
    public static IntPtr InitialWindow(int process, IntPtr candidate) {
        // Hosted apps can expose a child HWND owned by a different process from
        // their top-level frame. Activation and screenshots must use that frame.
        IntPtr root=GetAncestor(candidate,2);
        if (root!=IntPtr.Zero && root!=candidate && BelongsToProcess(candidate,process)) return root;
        // MainWindowHandle may be a detached/hidden CoreWindow while the real
        // app content is a different child of a shell-owned top-level frame.
        var hosts=new List<IntPtr>();
        EnumWindows(delegate(IntPtr frame,IntPtr data) {
            if (!IsWindowVisible(frame) || BelongsToProcess(frame,process)) return true;
            bool found=false;
            EnumChildWindows(frame,delegate(IntPtr child,IntPtr ignored) {
                if (BelongsToProcess(child,process)) {found=true;return false;}
                return true;
            },IntPtr.Zero);
            if (found) hosts.Add(frame);
            return true;
        },IntPtr.Zero);
        if (hosts.Count==1) return hosts[0];
        if (hosts.Count>1) throw new InvalidOperationException("Multiple hosted windows match the app; observe the specific frame before input.");
        // Process.MainWindowHandle may point to a transient selection toolbar.
        // Prefer its normal captioned window; later observations bind this handle.
        if ((GetWindowLong(candidate,-16)&0x00C00000)!=0 && (GetWindowLong(candidate,-20)&0x80)==0) return candidate;
        IntPtr best=IntPtr.Zero; long area=0;
        EnumWindows(delegate(IntPtr window,IntPtr data) {
            if (!BelongsToProcess(window,process) || !IsWindowVisible(window) || (GetWindowLong(window,-20)&0x80)!=0 || (GetWindowLong(window,-16)&0x00C00000)==0) return true;
            Rect r; if(GetWindowRect(window,out r)) {long size=(long)(r.Right-r.Left)*(r.Bottom-r.Top);if(size>area){best=window;area=size;}}
            return true;
        },IntPtr.Zero);
        return best==IntPtr.Zero?candidate:best;
    }

    public static void PhysicalPixels() {
        if (SetThreadDpiAwarenessContext(new IntPtr(-4)) == IntPtr.Zero)
            throw new Win32Exception("Could not establish per-monitor physical coordinates");
    }
    public static void RequireForeground(IntPtr window) {
        if (GetForegroundWindow() != window) throw new InvalidOperationException("Target lost foreground; no further input dispatched. Re-observe.");
    }
    public static bool IsForeground(IntPtr window) {return GetForegroundWindow()==window;}
    public static void Raise(IntPtr window) {
        if (IsIconic(window)) ShowWindowAsync(window, 9);
        if (GetForegroundWindow()==window) return;
        RequireReleasedModifiers();
        if (GetForegroundWindow() != window) SetForegroundWindow(window);
        if (GetForegroundWindow()!=window) {
            uint ignored;
            uint current=GetCurrentThreadId();
            uint foreground=GetWindowThreadProcessId(GetForegroundWindow(),out ignored);
            uint target=GetWindowThreadProcessId(window,out ignored);
            bool foregroundAttached=false, targetAttached=false;
            try {
                // Join only for activation, then always detach. No synthetic Alt
                // key or persistent foreground-lock setting is needed.
                if (foreground!=0 && foreground!=current) foregroundAttached=AttachThreadInput(current,foreground,true);
                if (target!=0 && target!=current && target!=foreground) targetAttached=AttachThreadInput(current,target,true);
                BringWindowToTop(window);
                SetForegroundWindow(window);
            } finally {
                if (targetAttached) AttachThreadInput(current,target,false);
                if (foregroundAttached) AttachThreadInput(current,foreground,false);
            }
        }
        for (int i=0; i<10 && GetForegroundWindow()!=window; i++) Thread.Sleep(30);
        if (GetForegroundWindow()!=window) throw new InvalidOperationException("Target activation was denied; no input dispatched. Re-observe before retrying.");
    }
    static void RequireReleasedModifiers() {
        foreach (int key in new int[] {0x10,0x11,0x12,0x5B,0x5C})
            if ((GetAsyncKeyState(key) & 0x8000) != 0) throw new InvalidOperationException("A modifier is held; input not dispatched.");
    }
    static void Dispatch(Input[] events) {
        uint sent=SendInput((uint)events.Length, events, Marshal.SizeOf(typeof(Input)));
        if (sent!=events.Length) throw new Win32Exception("Input partially dispatched or blocked; outcome unknown. Do not retry blindly.");
    }
    static Input Key(ushort vk, ushort scan, uint flags) {
        return new Input {type=1, data=new Union {key=new Keyboard {vk=vk,scan=scan,flags=flags}}};
    }
    static Input MouseEvent(uint flags, uint data=0) {
        return new Input {type=0,data=new Union {mouse=new Mouse {flags=flags,data=data}}};
    }
    public static void ValidatePoint(IntPtr window, int x, int y) {
        Rect r;
        if (!GetWindowRect(window,out r) || x<r.Left || y<r.Top || x>=r.Right || y>=r.Bottom)
            throw new InvalidOperationException("Point outside target window; re-observe.");
        var hit=GetAncestor(WindowFromPoint(new Point{X=x,Y=y}),2);
        uint targetProcess, hitProcess;
        GetWindowThreadProcessId(window,out targetProcess);
        GetWindowThreadProcessId(hit,out hitProcess);
        // Qt popups may have no Win32 owner, but remain in the observed app's
        // process and inside the captured main-window rectangle checked above.
        if (hit!=window && GetAncestor(hit,3)!=GetAncestor(window,3) && (targetProcess==0 || targetProcess!=hitProcess))
            throw new InvalidOperationException("Point covered by another window; re-observe.");
    }
    public static void Click(IntPtr window,int x,int y,string button,int count) {
        RequireForeground(window); RequireReleasedModifiers(); ValidatePoint(window,x,y);
        if (!SetCursorPos(x,y)) throw new Win32Exception("Cursor movement failed; click not dispatched.");
        uint down=2,up=4;
        if (button=="right") {down=8;up=16;} else if(button=="middle") {down=32;up=64;}
        for(int i=0;i<count;i++) {RequireForeground(window);ValidatePoint(window,x,y);Dispatch(new Input[]{MouseEvent(down),MouseEvent(up)}); if(i+1<count)Thread.Sleep(60);}
    }
    public static void Type(IntPtr window,string text) {
        RequireForeground(window); RequireReleasedModifiers();
        var inputs=new List<Input>();
        foreach(char ch in text) {inputs.Add(Key(0,ch,4));inputs.Add(Key(0,ch,6));}
        Dispatch(inputs.ToArray());
    }
    [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint thread);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern short VkKeyScanEx(char value, IntPtr layout);
    public static int CharacterKey(IntPtr window,char value) {
        uint owner; uint thread=GetWindowThreadProcessId(window,out owner);
        short key=VkKeyScanEx(value,GetKeyboardLayout(thread));
        if (key==-1 || (key&0xF800)!=0) throw new InvalidOperationException("Character is unavailable on the target keyboard layout; use type_text for literal text.");
        return key;
    }
    public static void Chord(IntPtr window,ushort[] modifiers,ushort key) {
        RequireForeground(window); RequireReleasedModifiers();
        var inputs=new List<Input>();
        foreach(ushort modifier in modifiers) inputs.Add(Key(modifier,0,0));
        uint extended=(key>=0x21 && key<=0x2E)?1u:0u;
        inputs.Add(Key(key,0,extended)); inputs.Add(Key(key,0,extended|2));
        for(int i=modifiers.Length-1;i>=0;i--) inputs.Add(Key(modifiers[i],0,2));
        Dispatch(inputs.ToArray());
    }
    public static void Scroll(IntPtr window,int x,int y,bool horizontal,int delta) {
        RequireForeground(window); RequireReleasedModifiers(); ValidatePoint(window,x,y);
        if(!SetCursorPos(x,y)) throw new Win32Exception("Cursor movement failed.");
        Dispatch(new Input[]{MouseEvent(horizontal?0x1000u:0x800u,unchecked((uint)delta))});
    }
    public static void Drag(IntPtr window,int x1,int y1,int x2,int y2) {
        RequireForeground(window);RequireReleasedModifiers();ValidatePoint(window,x1,y1);ValidatePoint(window,x2,y2);
        if(!SetCursorPos(x1,y1)) throw new Win32Exception("Cursor movement failed.");
        Dispatch(new Input[]{MouseEvent(2)});
        try { for(int i=1;i<=12;i++){RequireForeground(window);if(!SetCursorPos(x1+(x2-x1)*i/12,y1+(y2-y1)*i/12))throw new Win32Exception("Drag interrupted.");Thread.Sleep(15);} }
        finally {Dispatch(new Input[]{MouseEvent(4)});}
    }
}
