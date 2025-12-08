from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("api/sparql", views.sparql_proxy, name="sparql_proxy"),
]
