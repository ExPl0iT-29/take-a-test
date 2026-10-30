import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sebHashedPassword } from "@/lib/seb";

/**
 * Common remote-access / screen-share / communication apps blocked during
 * an exam. Deliberately excludes browser engines (chrome/firefox/edge) —
 * SEB itself embeds Chromium on some platforms, and killing that process
 * name risks taking SEB down with it.
 */
const PROHIBITED_PROCESSES = [
  "TeamViewer", "AnyDesk", "msra", "Zoom", "Discord", "Skype",
  "obs", "Slack", "Teams", "AeroAdmin", "Supremo", "Chrome Remote Desktop",
];

/**
 * Generates an UNENCRYPTED .seb config file (gzipped plist would be standard,
 * but SEB also accepts plain XML plist with extension .seb). Candidates
 * double-click this and SEB launches locked to the exam URL.
 *
 * sebConfigPurpose=0 ("starting an exam") is what actually makes this a
 * locked exam config — purpose=1 ("configuring a client") is an editable
 * settings file that exits freely regardless of the restrictions below it.
 *
 * IMPORTANT: After downloading, open the .seb file in the SEB Configuration
 * Tool once and set a Browser Exam Key (Exam tab), then paste that same
 * key into this test's "SEB key" field in the admin test editor — it's
 * stored per-test in test_secrets and verified cryptographically on every
 * request to /test/[id] (see lib/seb.ts), never as a presence-only check.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Require sign-in — this config reveals the exam URL and allowed hosts,
  // so it shouldn't be scrapeable anonymously by test id alone.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const origin = req.headers.get("x-forwarded-proto") && req.headers.get("host")
    ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
    : new URL(req.url).origin;

  const startUrl = `${origin}/test/${id}`;
  const host = new URL(origin).host;

  const { data: secret } = await adminClient()
    .from("test_secrets").select("seb_exit_password").eq("test_id", id).maybeSingle();
  const exitPassword = secret?.seb_exit_password || "";
  const hashedQuitPassword = exitPassword ? await sebHashedPassword(exitPassword) : "";

  const processesXml = PROHIBITED_PROCESSES.map((name) => `    <dict>
      <key>active</key><true/>
      <key>currentUser</key><true/>
      <key>strongKill</key><true/>
      <key>executable</key><string>${name}</string>
      <key>description</key><string>${name}</string>
    </dict>`).join("\n");

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>startURL</key><string>${startUrl}</string>
  <key>sebConfigPurpose</key><integer>0</integer>
  <key>browserViewMode</key><integer>1</integer>
  <key>mainBrowserWindowWidth</key><string>100%</string>
  <key>mainBrowserWindowHeight</key><string>100%</string>
  <key>enableTouchExit</key><false/>
  <key>allowQuit</key><${exitPassword ? "true" : "false"}/>
  <key>quitURL</key><string>${origin}/dashboard</string>
  <key>hashedQuitPassword</key><string>${hashedQuitPassword}</string>
  <key>ignoreExitKeys</key><false/>
  <key>enablePrivateClipboard</key><true/>
  <key>prohibitedProcesses</key>
  <array>
${processesXml}
  </array>
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
      "Content-Disposition": `attachment; filename="exam-${id}.seb"`,
    },
  });
}
