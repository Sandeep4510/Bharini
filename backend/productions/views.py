from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.responses import error_response, ok_response, request_id

from .models import ProductionProfile
from .serializers import ProductionSerializer


def production_queryset():
    return ProductionProfile.objects.prefetch_related('title_credits__title')


class MyProductionAPIView(APIView):
    def get(self, request):
        profile = production_queryset().filter(owner=request.user).first()
        if profile is None:
            return Response({'code': 'ok', 'message': 'No production profile yet.', 'request_id': request_id(request), 'data': None})
        data = ProductionSerializer(profile, context={'request': request}).data
        return ok_response(request, 'Production profile fetched.', data=data)


class ProductionCreateAPIView(APIView):
    def post(self, request):
        serializer = ProductionSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ok_response(
            request,
            'Production profile created.',
            data=serializer.data,
            status_code=status.HTTP_201_CREATED,
        )


class ProductionDetailAPIView(APIView):
    def get(self, request, pk):
        profile = get_object_or_404(production_queryset(), pk=pk)
        data = ProductionSerializer(profile, context={'request': request}).data
        return ok_response(request, 'Production profile fetched.', data=data)

    def patch(self, request, pk):
        profile = get_object_or_404(production_queryset(), pk=pk)
        if profile.owner_id != request.user.id:
            return error_response(request, 'forbidden', 'Only the owner can edit this profile.', status.HTTP_403_FORBIDDEN)
        serializer = ProductionSerializer(profile, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ok_response(request, 'Production profile updated.', data=serializer.data)
