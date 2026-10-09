"""Public links to the *same* geospatial inspection contract as the frontend.
No access token or private media URL is included in a public deep link.
"""
import os
from urllib.parse import urlencode

PUBLIC_ATLAS_URL=os.getenv("GEOSATHI_ATLAS_URL","https://geosathi-atlas.vercel.app").rstrip("/")

def inspect_url(lat,lon,query="",feature_id=""):
    args={"lat":f"{float(lat):.7f}","lon":f"{float(lon):.7f}"}
    if query:args["q"]=str(query)[:300]
    if feature_id:args["feature_id"]=str(feature_id)[:150]
    return f"{PUBLIC_ATLAS_URL}/inspect?{urlencode(args)}"

def street_url(lat,lon,query=""):
    # /inspect uses real Mapillary results in a mobile-sized provider viewer.
    return inspect_url(lat,lon,query)+"#street"
