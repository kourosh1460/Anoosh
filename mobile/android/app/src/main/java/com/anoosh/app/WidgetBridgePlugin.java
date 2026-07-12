package com.anoosh.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lets the web app refresh the home-screen widget after data changes. */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void refresh(PluginCall call) {
        try {
            Context ctx = getContext();
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, TodayWidget.class));
            for (int id : ids) {
                mgr.updateAppWidget(id, TodayWidget.build(ctx));
            }
        } catch (Exception ignored) { }
        call.resolve();
    }
}
