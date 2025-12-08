import urllib.parse
import urllib.request

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render

# Endpoint cible du serveur SPARQL (GraphDB ou autre)
SPARQL_ENDPOINT = "http://localhost:7200/repositories/idftransport"



def home(request):
    """Render the punctuality dashboard."""
    return render(request, "transports/index.html")


def sparql_proxy(request):
    """Proxy serveur pour contourner CORS en interrogeant SPARQL côté Django."""
    query = request.GET.get("query")
    if not query:
        return JsonResponse({"error": "missing query"}, status=400)

    url = f"{SPARQL_ENDPOINT}?{urllib.parse.urlencode({'query': query})}"
    req = urllib.request.Request(
        url, headers={"Accept": "application/sparql-results+json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = resp.read()
            content_type = resp.headers.get_content_type() or "application/json"
            return HttpResponse(data, content_type=content_type)
    except Exception as exc:
        return JsonResponse({"error": f"SPARQL request failed: {exc}"}, status=502)
