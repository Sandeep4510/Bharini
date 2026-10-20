from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import RefreshSession, User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'role')}),
        ('Permissions', {'fields': ('is_active', 'is_verified', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'first_name', 'last_name', 'role', 'password1', 'password2'),
        }),
    )
    list_display = ('email', 'first_name', 'last_name', 'role', 'is_verified', 'is_staff')
    ordering = ('email',)
    search_fields = ('email', 'first_name', 'last_name')
    list_filter = ('role', 'is_verified', 'is_staff', 'is_active')
    readonly_fields = ('date_joined', 'last_login')


@admin.register(RefreshSession)
class RefreshSessionAdmin(admin.ModelAdmin):
    list_display = ('public_id', 'user', 'created_at', 'last_used_at', 'expires_at', 'revoked_at')
    search_fields = ('public_id', 'user__email', 'jti_hash')
    list_filter = ('revoked_at', 'created_at', 'expires_at')
    readonly_fields = (
        'public_id',
        'user',
        'jti_hash',
        'family_id',
        'device_label',
        'user_agent',
        'ip_address',
        'created_at',
        'last_used_at',
        'expires_at',
        'revoked_at',
        'revoked_reason',
        'replaced_by',
    )
