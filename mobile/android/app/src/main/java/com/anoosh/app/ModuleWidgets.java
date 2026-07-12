package com.anoosh.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Widgets for the optional dashboard modules (Habits, Focus, Countdown).
 * All three share one layout and read the same JSON data file the web app
 * writes. Each is a thin static-inner provider so the manifest can register
 * them individually.
 */
public class ModuleWidgets {

    static JSONObject loadData(Context ctx) {
        try {
            File f = new File(ctx.getFilesDir(), "anoosh-data.json");
            if (!f.exists()) return null;
            byte[] buf = new byte[(int) f.length()];
            try (FileInputStream in = new FileInputStream(f)) {
                int off = 0;
                while (off < buf.length) { int r = in.read(buf, off, buf.length - off); if (r < 0) break; off += r; }
            }
            return new JSONObject(new String(buf, StandardCharsets.UTF_8));
        } catch (Exception e) { return null; }
    }

    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }

    static String addDays(String ymd, int delta) {
        try {
            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            Calendar c = Calendar.getInstance();
            c.setTime(fmt.parse(ymd));
            c.add(Calendar.DAY_OF_MONTH, delta);
            return fmt.format(c.getTime());
        } catch (Exception e) { return ymd; }
    }

    static RemoteViews build(Context ctx, String title, String[] rows, String footer) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_module);
        v.setTextViewText(R.id.wm_title, title);
        int[] ids = { R.id.wm_row1, R.id.wm_row2, R.id.wm_row3 };
        for (int i = 0; i < ids.length; i++) {
            if (i < rows.length && rows[i] != null) {
                v.setTextViewText(ids[i], rows[i]);
                v.setViewVisibility(ids[i], View.VISIBLE);
            } else v.setViewVisibility(ids[i], View.GONE);
        }
        v.setTextViewText(R.id.wm_footer, footer == null ? "" : footer);
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open != null) {
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            v.setOnClickPendingIntent(R.id.wm_root, PendingIntent.getActivity(ctx, 0, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        return v;
    }

    static void updateAll(Context ctx, AppWidgetManager mgr, int[] ids, RemoteViews v) {
        for (int id : ids) mgr.updateAppWidget(id, v);
    }

    /** Habits — top streaks. */
    public static class HabitsWidget extends AppWidgetProvider {
        @Override public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
            JSONObject data = loadData(ctx);
            String[] rows = new String[3];
            int n = 0, total = 0;
            if (data != null) {
                JSONArray habits = data.optJSONArray("habits");
                if (habits != null) {
                    total = habits.length();
                    for (int i = 0; i < habits.length() && n < 3; i++) {
                        JSONObject h = habits.optJSONObject(i);
                        if (h == null) continue;
                        JSONObject hist = h.optJSONObject("history");
                        int streak = 0;
                        if (hist != null) {
                            String d = today();
                            if (!hist.optBoolean(d, false)) d = addDays(d, -1);
                            while (hist.optBoolean(d, false)) { streak++; d = addDays(d, -1); }
                        }
                        boolean doneToday = hist != null && hist.optBoolean(today(), false);
                        rows[n++] = (doneToday ? "✓ " : "○ ") + h.optString("title", "Habit")
                                + (streak > 0 ? "  ·  " + streak + "d" : "");
                    }
                }
            }
            String footer = total == 0 ? "No habits yet — add one in Anoosh" : total + " habit" + (total == 1 ? "" : "s");
            updateAll(ctx, mgr, ids, build(ctx, "Habits", rows, footer));
        }
    }

    /** Focus — today's focused time. */
    public static class FocusWidget extends AppWidgetProvider {
        @Override public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
            JSONObject data = loadData(ctx);
            long todayMs = 0; int count = 0;
            if (data != null) {
                JSONArray sessions = data.optJSONArray("sessions");
                if (sessions != null) {
                    String today = today();
                    for (int i = 0; i < sessions.length(); i++) {
                        JSONObject s = sessions.optJSONObject(i);
                        if (s == null || !"focus".equals(s.optString("kind"))) continue;
                        if (s.optString("startedAt", "").startsWith(today)) {
                            todayMs += s.optLong("durationMs", 0);
                            count++;
                        }
                    }
                }
            }
            long mins = todayMs / 60000;
            String big = mins >= 60 ? (mins / 60) + "h " + (mins % 60) + "m" : mins + "m";
            String[] rows = { "⏱  " + big + " focused today", count > 0 ? "○  " + count + " session" + (count == 1 ? "" : "s") : "○  Start a round from the timer" };
            updateAll(ctx, mgr, ids, build(ctx, "Focus", rows, "Tap to open the timer"));
        }
    }

    /** Countdown — next upcoming events. */
    public static class CountdownWidget extends AppWidgetProvider {
        @Override public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
            JSONObject data = loadData(ctx);
            String[] rows = new String[3];
            int n = 0;
            if (data != null) {
                JSONArray events = data.optJSONArray("events");
                if (events != null) {
                    String today = today();
                    java.util.ArrayList<JSONObject> up = new java.util.ArrayList<>();
                    for (int i = 0; i < events.length(); i++) {
                        JSONObject ev = events.optJSONObject(i);
                        if (ev != null && ev.optString("date", "").compareTo(today) >= 0) up.add(ev);
                    }
                    java.util.Collections.sort(up, (a, b) -> a.optString("date").compareTo(b.optString("date")));
                    for (JSONObject ev : up) {
                        if (n >= 3) break;
                        try {
                            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                            long days = (fmt.parse(ev.optString("date")).getTime() - fmt.parse(today).getTime()) / 86400000L;
                            String lead = days == 0 ? "today" : days == 1 ? "tomorrow" : days + " days";
                            rows[n++] = "•  " + ev.optString("title", "Event") + "  ·  " + lead;
                        } catch (Exception ignored) { }
                    }
                }
            }
            String footer = n == 0 ? "No upcoming events" : null;
            updateAll(ctx, mgr, ids, build(ctx, "Countdown", rows, footer == null ? "" : footer));
        }
    }
}
