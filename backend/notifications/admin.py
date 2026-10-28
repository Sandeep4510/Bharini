from django.contrib import admin

from .models import NotificationSettings, PushDevice


@admin.register(PushDevice)
class PushDeviceAdmin(admin.ModelAdmin):
    list_display = ('user', 'platform', 'last_seen_at')
    search_fields = ('user__email',)


@admin.register(NotificationSettings)
class NotificationSettingsAdmin(admin.ModelAdmin):
    list_display = ('user', 'messages', 'connections', 'follows', 'casting')
