"""Acceptance-only process observation. Run with pythonw.exe, without a console."""
import argparse
import ctypes
from ctypes import wintypes
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re


def observe(args):
    evidence = Path(args.evidence).resolve()
    if not evidence.is_dir() or not re.fullmatch(r"D:\\Kuade-acceptance\\host-[a-f0-9-]{36}", str(evidence), re.I):
        raise ValueError("Expected an owned acceptance directory")
    target = evidence / "exit-observation-gui.json"
    receipt = {"status": "not-passed", "processId": args.pid, "observerPid": os.getpid()}

    def save():
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, target)

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)

    def api(name, result, arguments):
        function = getattr(kernel, name)
        function.restype, function.argtypes = result, arguments
        return function

    open_process = api("OpenProcess", wintypes.HANDLE, [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD])
    image = api("QueryFullProcessImageNameW", wintypes.BOOL, [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)])
    times = api("GetProcessTimes", wintypes.BOOL, [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4)
    wait = api("WaitForSingleObject", wintypes.DWORD, [wintypes.HANDLE, wintypes.DWORD])
    exit_code = api("GetExitCodeProcess", wintypes.BOOL, [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)])
    close = api("CloseHandle", wintypes.BOOL, [wintypes.HANDLE])
    console = api("GetConsoleWindow", wintypes.HWND, [])
    handle = None
    try:
        receipt["consoleWindow"] = bool(console())
        # SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION; no mutation rights.
        handle = open_process(0x00101000, False, args.pid)
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        size = wintypes.DWORD(32768)
        buffer = ctypes.create_unicode_buffer(size.value)
        if not image(handle, 0, buffer, ctypes.byref(size)):
            raise ctypes.WinError(ctypes.get_last_error())
        if os.path.normcase(os.path.realpath(buffer.value)) != os.path.normcase(os.path.realpath(args.executable)):
            raise ValueError("Observed executable identity mismatch")
        creation, ended, cpu_kernel, cpu_user = (wintypes.FILETIME() for _ in range(4))
        if not times(handle, ctypes.byref(creation), ctypes.byref(ended), ctypes.byref(cpu_kernel), ctypes.byref(cpu_user)):
            raise ctypes.WinError(ctypes.get_last_error())
        ticks = (creation.dwHighDateTime << 32) | creation.dwLowDateTime
        seconds, fraction = divmod(ticks - 116444736000000000, 10000000)
        started = datetime.fromtimestamp(seconds, timezone.utc) + timedelta(microseconds=fraction // 10)
        expected = datetime.fromisoformat(args.started.replace("Z", "+00:00"))
        if abs((started - expected).total_seconds()) > 0.001:
            raise ValueError("Observed process creation time mismatch")
        receipt.update(status="running", executable=buffer.value, processStartedAt=started.isoformat(), processCreationTicks=str(ticks), attachedAt=datetime.now(timezone.utc).isoformat())
        save()
        # A signaled process handle establishes termination even for exit 259.
        if wait(handle, 0xFFFFFFFF) != 0:
            raise ctypes.WinError(ctypes.get_last_error())
        code = wintypes.DWORD()
        if not exit_code(handle, ctypes.byref(code)):
            raise ctypes.WinError(ctypes.get_last_error())
        receipt.update(status="exited", exitCode=code.value)
    except Exception as error:
        receipt.update(status="not-passed", error=str(error))
    finally:
        if handle:
            close(handle)
        receipt["finishedAt"] = datetime.now(timezone.utc).isoformat()
        save()
    return 0 if receipt["status"] == "exited" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--executable", required=True)
    parser.add_argument("--started", required=True)
    parser.add_argument("--evidence", required=True)
    raise SystemExit(observe(parser.parse_args()))
