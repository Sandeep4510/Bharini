from django.contrib import admin

from .models import ArtistProfile, PortfolioMedia, ProfileDocument, ProfileLanguage


class ProfileLanguageInline(admin.TabularInline):
    model = ProfileLanguage
    extra = 0


class PortfolioMediaInline(admin.TabularInline):
    model = PortfolioMedia
    extra = 0
    readonly_fields = ('discipline', 'slot', 'kind', 'file', 'duration_seconds', 'uploaded_at')


class ProfileDocumentInline(admin.TabularInline):
    model = ProfileDocument
    extra = 0


@admin.register(ArtistProfile)
class ArtistProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'username', 'disciplines', 'gender', 'location', 'phone', 'updated_at')
    search_fields = ('username', 'user__email', 'user__first_name', 'user__last_name', 'phone')
    exclude = ('alt_email_pin_hash',)
    inlines = [ProfileLanguageInline, PortfolioMediaInline, ProfileDocumentInline]
