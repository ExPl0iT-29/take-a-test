import { NextRequest, NextResponse } from "next/server";

/**
 * Generates an UNENCRYPTED .seb config file (gzipped plist would be standard,
 * but SEB also accepts plain XML plist with extension .seb). Candidates
 * double-click this and SEB launches locked to the exam URL.
 *
 * IMPORTANT: After downloading, open the .seb file in the SEB Configuration
 * Tool once and set a Browser Exam Key (Exam tab) + paste it into your
 * SEB_BROWSER_EXAM_KEY env var. SEB sends the BEK hash on every request so
 * the server can verify the candidate is actually inside SEB.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get("x-forwarded-proto") && req.headers.get("host")
    ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
    : new URL(req.url).origin;

  const startUrl = `${origin}/test/${params.id}`;
  const host = new URL(origin).host;

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>startURL</key><string>${startUrl}</string>
  <key>sebConfigPurpose</key><integer>1</integer>
  <key>browserViewMode</key><integer>1</integer>
  <key>mainBrowserWindowWidth</key><string>100%</string>
  <key>mainBrowserWindowHeight</key><string>100%</string>
  <key>enableTouchExit</key><false/>
  <key>allowQuit</key><true/>
  <key>quitURL</key><string>${origin}/dashboard</string>
  <key>hashedQuitPassword</key><string></string>
  <key>ignoreExitKeys</key><false/>
  <key>enableF1</key><false/>
  <key>enableF3</key><false/>
  <key>enableF5</key><false/>
  <key>enableF11</key><false/>
  <key>enableF12</key><false/>
  <key>enablePrintScreen</key><false/>
  <key>enableEsc</key><false/>
  <key>enableCtrlEsc</key><false/>
  <key>enableAltEsc</key><false/>
  <key>enableAltTab</key><false/>
  <key>enableAltF4</key><false/>
  <key>enableStartMenu</key><false/>
  <key>enableRightMouse</key><false/>
  <key>showTaskBar</key><false/>
  <key>showReloadButton</key><false/>
  <key>showMenuBar</key><false/>
  <key>browserScreenKeyboard</key><false/>
  <key>allowSpellCheck</key><false/>
  <key>allowDictation</key><false/>
  <key>enableJavaScript</key><true/>
  <key>enableBrowsingBackForward</key><false/>
  <key>newBrowserWindowByLinkPolicy</key><integer>0</integer>
  <key>newBrowserWindowByScriptPolicy</key><integer>0</integer>
  <key>blockPopUpWindows</key><true/>
  <key>allowDownUploads</key><false/>
  <key>allowDownloads</key><false/>
  <key>allowFlashFullscreen</key><false/>
  <key>allowVideoCapture</key><true/>
  <key>allowAudioCapture</key><false/>
  <key>allowScreenSharing</key><false/>
  <key>allowVirtualMachine</key><false/>
  <key>detectStoppedProcess</key><true/>
  <key>monitorProcesses</key><true/>
  <key>allowDisplayMirroring</key><false/>
  <key>allowedDisplaysMaxNumber</key><integer>1</integer>
  <key>URLFilterEnable</key><true/>
  <key>URLFilterEnableContentFilter</key><true/>
  <key>URLFilterRules</key>
  <array>
    <dict>
      <key>action</key><integer>1</integer>
      <key>active</key><true/>
      <key>expression</key><string>${host}/*</string>
      <key>regex</key><false/>
    </dict>
    <dict>
      <key>action</key><integer>1</integer>
      <key>active</key><true/>
      <key>expression</key><string>*.supabase.co/*</string>
      <key>regex</key><false/>
    </dict>
  </array>
  <key>sendBrowserExamKey</key><true/>
</dict>
</plist>`;

  return new NextResponse(plist, {
    headers: {
      "Content-Type": "application/seb",
      "Content-Disposition": `attachment; filename="exam-${params.id}.seb"`,
    },
  });
}
