from django.db import IntegrityError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.responses import error_response, ok_response, request_id
from connections.models import Block

from .models import ProductionProfile
from .serializers import ProductionSerializer


def production_queryset():
    return ProductionProfile.objects.prefetch_related('title_credits__title')


def not_found(request):
    return error_response(request, 'not_found', 'Production profile not found.', status.HTTP_404_NOT_FOUND)


def validation_error(request, message, errors):
    return error_response(request, 'validation_error', message, status.HTTP_400_BAD_REQUEST, field_errors=errors)


def duplicate_profile(request):
    message = 'You already have a production profile.'
    return validation_error(request, message, {'non_field_errors': [message]})


class MyProductionAPIView(APIView):
    def get(self, request):
        profile = production_queryset().filter(owner=request.user).first()
        if profile is None:
            return Response({'code': 'ok', 'message': 'No production profile yet.', 'request_id': request_id(request), 'data': None})
        data = ProductionSerializer(profile, context={'request': request}).data
        return ok_response(request, 'Production profile fetched.', data=data)


class ProductionCreateAPIView(APIView):
    def post(self, request):
        if ProductionProfile.objects.filter(owner=request.user).exists():
            return duplicate_profile(request)
        serializer = ProductionSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return validation_error(request, 'Please fix the highlighted fields.', serializer.errors)
        try:
            serializer.save(owner=request.user)
        except IntegrityError:
            return duplicate_profile(request)
        return ok_response(
            request,
            'Production profile created.',
            data=serializer.data,
            status_code=status.HTTP_201_CREATED,
        )


class ProductionDetailAPIView(APIView):
    def get(self, request, pk):
        profile = production_queryset().filter(pk=pk, owner__is_active=True).first()
        # an owner who blocked you looks like a missing profile
        if profile is None or Block.objects.filter(blocker=profile.owner_id, blocked=request.user).exists():
            return not_found(request)
        data = ProductionSerializer(profile, context={'request': request}).data
        return ok_response(request, 'Production profile fetched.', data=data)

    def patch(self, request, pk):
        profile = production_queryset().filter(pk=pk).first()
        if profile is None:
            return not_found(request)
        if profile.owner_id != request.user.id:
            return error_response(request, 'forbidden', 'Only the owner can edit this profile.', status.HTTP_403_FORBIDDEN)
        serializer = ProductionSerializer(profile, data=request.data, partial=True, context={'request': request})
        if not serializer.is_valid():
            return validation_error(request, 'Please fix the highlighted fields.', serializer.errors)
        serializer.save()
        return ok_response(request, 'Production profile updated.', data=serializer.data)
