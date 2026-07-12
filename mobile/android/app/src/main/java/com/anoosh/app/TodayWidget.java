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
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.Locale;

/**
 * Anoosh "Today" home-screen widget: date + today's (and overdue) tasks.
 * Reads the same JSON data file the web app writes via the Filesystem
 * plugin (Directory.Data == getFilesDir()).
 */
public class TodayWidget extends AppWidgetProvider {

    private static final int[] ROW_IDS = {
            R.id.widget_row1, R.id.widget_row2, R.id.widget_row3,
            R.id.widget_row4, R.id.widget_row5
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, build(context));
        }
    }

    static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);

        SimpleDateFormat headerFmt = new SimpleDateFormat("EEEE, MMM d", Locale.getDefault());
        views.setTextViewText(R.id.widget_date, headerFmt.format(new Date()));

        ArrayList<JSONObject> tasks = loadTodayTasks(context);
        int shown = Math.min(tasks.size(), ROW_IDS.length);
        for (int i = 0; i < ROW_IDS.length; i++) {
            if (i < shown) {
                JSONObject t = tasks.get(i);
                String time = t.optString("dueTime", "");
                String title = t.optString("title", "Untitled");
                String prefix = t.optInt("priority", 0) >= 3 ? "‼ " : "";
                views.setTextViewText(ROW_IDS[i],
                        "○  " + prefix + title + (time.isEmpty() ? "" : "  · " + time));
                views.setViewVisibility(ROW_IDS[i], View.VISIBLE);
            } else {
                views.setViewVisibility(ROW_IDS[i], View.GONE);
            }
        }

        String summary;
        if (tasks.isEmpty()) summary = "All clear — nothing due today";
        else if (tasks.size() > shown) summary = "+" + (tasks.size() - shown) + " more due today";
        else summary = tasks.size() == 1 ? "1 task due today" : tasks.size() + " tasks due today";
        views.setTextViewText(R.id.widget_summary, summary);

        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open != null) {
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(context, 0, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pi);
        }
        return views;
    }

    private static ArrayList<JSONObject> loadTodayTasks(Context context) {
        ArrayList<JSONObject> out = new ArrayList<>();
        try {
            File file = new File(context.getFilesDir(), "anoosh-data.json");
            if (!file.exists()) return out;
            byte[] buf = new byte[(int) file.length()];
            try (FileInputStream in = new FileInputStream(file)) {
                int off = 0;
                while (off < buf.length) {
                    int r = in.read(buf, off, buf.length - off);
                    if (r < 0) break;
                    off += r;
                }
            }
            JSONObject data = new JSONObject(new String(buf, StandardCharsets.UTF_8));
            JSONArray tasks = data.optJSONArray("tasks");
            if (tasks == null) return out;
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t == null || t.optBoolean("done", false)) continue;
                String due = t.optString("dueDate", "");
                if (due.isEmpty() || due.compareTo(today) > 0) continue;
                out.add(t);
            }
            Collections.sort(out, (a, b) -> {
                int byDate = a.optString("dueDate", "").compareTo(b.optString("dueDate", ""));
                if (byDate != 0) return byDate;
                return Integer.compare(b.optInt("priority", 0), a.optInt("priority", 0));
            });
        } catch (Exception ignored) { }
        return out;
    }
}
