'use strict';
/** Patches the iOS project: local-network permissions for Wi-Fi sync. */
const fs = require('fs');
const path = require('path');

const plistPath = path.join(__dirname, '..', 'ios', 'App', 'App', 'Info.plist');
if (!fs.existsSync(plistPath)) { console.error('ios project not found'); process.exit(1); }
let plist = fs.readFileSync(plistPath, 'utf8');

// Capacitor StatusBar.setStyle only works when this is NO.
if (plist.includes('<key>UIViewControllerBasedStatusBarAppearance</key>\n\t<true/>')) {
  plist = plist.replace('<key>UIViewControllerBasedStatusBarAppearance</key>\n\t<true/>',
    '<key>UIViewControllerBasedStatusBarAppearance</key>\n\t<false/>');
  console.log('patched Info.plist (status bar appearance)');
}

if (!plist.includes('NSAppTransportSecurity')) {
  plist = plist.replace('</dict>\n</plist>', `\t<key>NSAppTransportSecurity</key>
\t<dict>
\t\t<key>NSAllowsLocalNetworking</key>
\t\t<true/>
\t</dict>
\t<key>NSLocalNetworkUsageDescription</key>
\t<string>Anoosh talks to the Anoosh desktop app on your own Wi-Fi to sync your data. Nothing leaves your network.</string>
</dict>
</plist>`);
  fs.writeFileSync(plistPath, plist);
  console.log('patched Info.plist (local networking for sync)');
} else console.log('Info.plist already patched');
