from django.contrib import admin

from .models import ProductionProfile, ProductionTitle, Title


class ProductionTitleInline(admin.TabularInline):
    model = ProductionTitle
    extra = 1


@admin.register(ProductionProfile)
class ProductionProfileAdmin(admin.ModelAdmin):
    list_display = ['name', 'kind', 'owner', 'created_at']
    list_filter = ['kind']
    search_fields = ['name', 'owner__email']
    inlines = [ProductionTitleInline]


@admin.register(Title)
class TitleAdmin(admin.ModelAdmin):
    list_display = ['name', 'kind', 'release_year']
    list_filter = ['kind']
    search_fields = ['name']
