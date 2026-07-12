'use strict';
/**
 * Installs Anoosh's native Android pieces into the Capacitor-generated
 * project: the Today widget, the WidgetBridge plugin, MainActivity,
 * manifest entries and permissions. Idempotent — safe after every
 * `npx cap sync android`.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const androidMain = path.join(root, 'android', 'app', 'src', 'main');
const javaDir = path.join(androidMain, 'java', 'com', 'anoosh', 'app');
const resDir = path.join(androidMain, 'res');
const nativeDir = path.join(root, 'native');

if (!fs.existsSync(androidMain)) {
  console.error('android project not found — run `npx cap add android` first');
  process.exit(1);
}

/* ---- copy Java + resources ---- */
const copies = [
  ['java/MainActivity.java', path.join(javaDir, 'MainActivity.java')],
  ['java/TodayWidget.java', path.join(javaDir, 'TodayWidget.java')],
  ['java/WidgetBridgePlugin.java', path.join(javaDir, 'WidgetBridgePlugin.java')],
  ['java/ModuleWidgets.java', path.join(javaDir, 'ModuleWidgets.java')],
  ['res/layout/widget_module.xml', path.join(resDir, 'layout', 'widget_module.xml')],
  ['res/xml/widget_module_info.xml', path.join(resDir, 'xml', 'widget_module_info.xml')],
  ['res/layout/widget_today.xml', path.join(resDir, 'layout', 'widget_today.xml')],
  ['res/values/widget_styles.xml', path.join(resDir, 'values', 'widget_styles.xml')],
  ['res/drawable/widget_bg.xml', path.join(resDir, 'drawable', 'widget_bg.xml')],
  ['res/xml/widget_today_info.xml', path.join(resDir, 'xml', 'widget_today_info.xml')]
];
for (const [from, to] of copies) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(nativeDir, from), to);
  console.log('installed', from);
}

/* ---- strings.xml: widget description ---- */
const stringsPath = path.join(resDir, 'values', 'strings.xml');
let strings = fs.readFileSync(stringsPath, 'utf8');
if (!strings.includes('widget_description')) {
  strings = strings.replace('</resources>',
    '    <string name="widget_description">Today’s tasks at a glance</string>\n</resources>');
  fs.writeFileSync(stringsPath, strings);
  console.log('patched strings.xml');
}

/* ---- AndroidManifest: cleartext (LAN sync), permissions, widget receiver ---- */
const manifestPath = path.join(androidMain, 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');

if (!manifest.includes('usesCleartextTraffic')) {
  manifest = manifest.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
  console.log('patched manifest: cleartext traffic (Wi-Fi LAN sync)');
}
for (const perm of ['android.permission.POST_NOTIFICATIONS', 'android.permission.SCHEDULE_EXACT_ALARM']) {
  if (!manifest.includes(perm)) {
    manifest = manifest.replace('</manifest>',
      `    <uses-permission android:name="${perm}" />\n</manifest>`);
    console.log('patched manifest: ' + perm);
  }
}
for (const [cls, label] of [
  ['ModuleWidgets$HabitsWidget', 'Anoosh Habits'],
  ['ModuleWidgets$FocusWidget', 'Anoosh Focus'],
  ['ModuleWidgets$CountdownWidget', 'Anoosh Countdown']
]) {
  if (!manifest.includes(cls)) {
    const receiver = `
        <receiver
            android:name=".${cls}"
            android:exported="true"
            android:label="${label}">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/widget_module_info" />
        </receiver>
`;
    manifest = manifest.replace('</application>', receiver + '    </application>');
    console.log('patched manifest: ' + cls);
  }
}
if (!manifest.includes('TodayWidget')) {
  const receiver = `
        <receiver
            android:name=".TodayWidget"
            android:exported="true"
            android:label="Anoosh Today">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/widget_today_info" />
        </receiver>
`;
  manifest = manifest.replace('</application>', receiver + '    </application>');
  console.log('patched manifest: widget receiver');
}
fs.writeFileSync(manifestPath, manifest);

console.log('native install complete');
