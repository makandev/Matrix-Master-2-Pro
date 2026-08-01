using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MatrixNG;

// Native Windows host for the Matrix // Next-Gen WebGL frontend.
// One executable, several personalities selected by command line:
//   (none)          -> normal resizable window
//   --fullscreen    -> borderless fullscreen
//   --wallpaper     -> animated desktop wallpaper (behind the icons)
//   /s              -> screensaver (Windows passes this)
//   /p <hwnd>       -> screensaver preview (small)
//   /c              -> screensaver "settings" (we just point at the app UI)
// Rename the published MatrixNG.exe to MatrixNG.scr to install it as a
// screensaver; Windows then launches it with /s, /p or /c automatically.
internal static class Program
{
    private enum Mode { Window, Fullscreen, Wallpaper, Screensaver, Preview }

    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        // Screensaver "settings": Windows launches us with /c. Point the user
        // at the real controls instead of a throwaway dialog of options.
        if (args.Length > 0 && args[0].StartsWith("/c", StringComparison.OrdinalIgnoreCase))
        {
            MessageBox.Show(
                "Matrix // Next-Gen\n\nDie Optik stellst du im normalen App-Fenster ein (Slider, Presets, Ctrl+K).\nDie zuletzt gewählten Einstellungen gelten auch als Bildschirmschoner.",
                "Matrix // Next-Gen", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var (mode, previewHandle) = ParseArgs(args);

        if (mode == Mode.Preview && previewHandle == IntPtr.Zero)
            return; // nothing sensible to draw into

        Application.Run(new MatrixForm(mode, previewHandle));
    }

    private static (Mode, IntPtr) ParseArgs(string[] args)
    {
        if (args.Length == 0) return (Mode.Window, IntPtr.Zero);

        var first = args[0].ToLowerInvariant();

        // Screensaver preview: "/p 12345" (handle can be in the next arg).
        if (first.StartsWith("/p"))
        {
            IntPtr h = IntPtr.Zero;
            var inline = first.Length > 2 ? first[2..].TrimStart(':') : "";
            if (long.TryParse(inline, out var hv)) h = new IntPtr(hv);
            else if (args.Length > 1 && long.TryParse(args[1], out hv)) h = new IntPtr(hv);
            return (Mode.Preview, h);
        }
        if (first.StartsWith("/s")) return (Mode.Screensaver, IntPtr.Zero);
        if (first.StartsWith("/c")) return (Mode.Screensaver, IntPtr.Zero);
        if (first is "--fullscreen" or "-f" or "/full") return (Mode.Fullscreen, IntPtr.Zero);
        if (first is "--wallpaper" or "-w" or "/wallpaper") return (Mode.Wallpaper, IntPtr.Zero);

        return (Mode.Window, IntPtr.Zero);
    }

    // ---- Win32 for wallpaper / screensaver parenting ----
    [DllImport("user32.dll")] private static extern IntPtr FindWindow(string? cls, string? win);
    [DllImport("user32.dll")] private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string? cls, string? win);
    [DllImport("user32.dll")] private static extern IntPtr SetParent(IntPtr child, IntPtr newParent);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
    [DllImport("user32.dll")] private static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr hwnd, out RECT r);
    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr p);
    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int L, T, R, B; }

    // Ask Progman to spawn a WorkerW behind the icons, then hand the caller its handle.
    internal static IntPtr GetWallpaperHost()
    {
        var progman = FindWindow("Progman", null);
        SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out _);

        IntPtr workerw = IntPtr.Zero;
        EnumWindows((top, _) =>
        {
            if (FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                workerw = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
            return true;
        }, IntPtr.Zero);

        return workerw != IntPtr.Zero ? workerw : progman;
    }

    internal static void Reparent(IntPtr child, IntPtr parent) => SetParent(child, parent);

    internal static Size ClientSizeOf(IntPtr hwnd)
    {
        if (GetClientRect(hwnd, out var r)) return new Size(r.R - r.L, r.B - r.T);
        return Size.Empty;
    }
}

internal sealed class MatrixForm : Form
{
    private readonly WebView2 _web = new();
    private readonly bool _immersive;   // fullscreen/screensaver/wallpaper => no chrome, exit on input
    private readonly bool _exitOnInput;
    private readonly string _mode;

    // Saved chrome for toggling true native fullscreen from a windowed state.
    private Rectangle _prevBounds;
    private FormBorderStyle _prevBorder;
    private FormWindowState _prevState;
    private bool _nativeFs;

    public MatrixForm(object modeObj, IntPtr previewHandle)
    {
        var mode = modeObj.ToString()!;
        _mode = mode;
        Text = "Matrix // Next-Gen";
        BackColor = Color.Black;
        DoubleBuffered = true;
        try { Icon = System.Drawing.Icon.ExtractAssociatedIcon(Environment.ProcessPath!); } catch { /* ignore */ }

        _immersive = mode is "Fullscreen" or "Screensaver" or "Wallpaper" or "Preview";
        _exitOnInput = mode is "Screensaver";

        switch (mode)
        {
            case "Fullscreen":
            case "Screensaver":
                FormBorderStyle = FormBorderStyle.None;
                WindowState = FormWindowState.Maximized;
                TopMost = mode == "Screensaver";
                Bounds = Screen.PrimaryScreen!.Bounds;
                Cursor.Hide();
                break;

            case "Wallpaper":
                FormBorderStyle = FormBorderStyle.None;
                ShowInTaskbar = false;
                break;

            case "Preview":
                FormBorderStyle = FormBorderStyle.None;
                break;

            default: // Window
                StartPosition = FormStartPosition.CenterScreen;
                Size = new Size(1280, 800);
                MinimumSize = new Size(640, 400);
                break;
        }

        _web.Dock = DockStyle.Fill;
        _web.DefaultBackgroundColor = Color.Black;
        Controls.Add(_web);

        Load += async (_, _) => await InitWebViewAsync();

        // Reparent after the handle exists.
        if (mode == "Wallpaper")
            Shown += (_, _) => AttachAsWallpaper();
        else if (mode == "Preview" && previewHandle != IntPtr.Zero)
            Shown += (_, _) => AttachToPreview(previewHandle);
    }

    private async Task InitWebViewAsync()
    {
        var userData = Path.Combine(Path.GetTempPath(), "MatrixNG.WebView2");
        var env = await CoreWebView2Environment.CreateAsync(null, userData);
        await _web.EnsureCoreWebView2Async(env);

        var core = _web.CoreWebView2;
        // Serve the bundled frontend over a virtual host so ES modules load
        // without file:// CORS problems.
        var wwwroot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        core.SetVirtualHostNameToFolderMapping("matrix.app", wwwroot, CoreWebView2HostResourceAccessKind.Allow);

        // Trim the browser affordances we don't want in a kiosk/wallpaper.
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;
        core.Settings.IsStatusBarEnabled = false;

        // Auto-grant microphone for the audio-reactive feature.
        core.PermissionRequested += (_, args) =>
        {
            if (args.PermissionKind == CoreWebView2PermissionKind.Microphone)
                args.State = CoreWebView2PermissionState.Allow;
        };

        // When the web app calls requestFullscreen() (F / F11), make the native
        // window truly borderless-fullscreen — not just the web content.
        core.ContainsFullScreenElementChanged += (_, _) =>
        {
            if (core.ContainsFullScreenElement) EnterFullscreen();
            else ExitFullscreen();
        };

        core.Navigate("https://matrix.app/index.html");

        if (_exitOnInput)
            core.WebMessageReceived += (_, _) => { };
    }

    private void EnterFullscreen()
    {
        if (_nativeFs || _mode is "Wallpaper" or "Preview") return;
        _nativeFs = true;
        _prevBounds = Bounds;
        _prevBorder = FormBorderStyle;
        _prevState = WindowState;
        WindowState = FormWindowState.Normal; // Maximized can't go borderless-cover cleanly
        FormBorderStyle = FormBorderStyle.None;
        Bounds = Screen.FromControl(this).Bounds; // whole monitor the window is on
        TopMost = true;
        Cursor.Hide();
    }

    private void ExitFullscreen()
    {
        if (!_nativeFs) return;
        _nativeFs = false;
        TopMost = _mode == "Screensaver";
        FormBorderStyle = _prevBorder;
        Bounds = _prevBounds;
        WindowState = _prevState;
        Cursor.Show();
    }

    private void AttachAsWallpaper()
    {
        var host = Program.GetWallpaperHost();
        Program.Reparent(Handle, host);
        var size = Program.ClientSizeOf(host);
        if (size == Size.Empty) size = Screen.PrimaryScreen!.Bounds.Size;
        Location = Point.Empty;
        Size = size;
    }

    private void AttachToPreview(IntPtr preview)
    {
        Program.Reparent(Handle, preview);
        var size = Program.ClientSizeOf(preview);
        Location = Point.Empty;
        Size = size == Size.Empty ? new Size(200, 150) : size;
    }

    // Screensaver: any real input ends it.
    private Point _lastMouse = Point.Empty;
    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (_exitOnInput)
        {
            if (_lastMouse == Point.Empty) _lastMouse = e.Location;
            else if (Math.Abs(e.X - _lastMouse.X) > 8 || Math.Abs(e.Y - _lastMouse.Y) > 8) Close();
        }
        base.OnMouseMove(e);
    }
    protected override void OnKeyDown(KeyEventArgs e) { if (_exitOnInput) Close(); base.OnKeyDown(e); }
    protected override void OnMouseDown(MouseEventArgs e) { if (_exitOnInput) Close(); base.OnMouseDown(e); }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        Cursor.Show();
        base.OnFormClosed(e);
    }
}
