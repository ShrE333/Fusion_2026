"""Short, user-oriented GeoSathi WhatsApp responses (English, Hindi, Marathi).

No internal search IDs, inference timing, raw coordinates or duplicate links.
GeoSathi predictions are always labelled as unverified candidates.
"""
from __future__ import annotations

import re
import unicodedata

COPY = {
    "en": {
        "search_progress": "🔎 Searching the map near your shared location…",
        "road_progress": "⏳ Checking your road photo…",
        "search_title": "🗺️ *GeoSathi Search Results*",
        "query": "*You searched:* {query}",
        "match": "*Found:* {count} mapped {layer} features",
        "example": "*Example:* {name}",
        "candidates": "*Found:* {count} possible imagery matches",
        "candidate_example": "*Top suggestion:* Near your selected location",
        "none": "No matching locations were found around your pin. Try another place or a broader search.",
        "not_ready": "Search is unavailable right now. Please try again shortly.",
        "failed": "We couldn't complete this search. Please try again.",
        "area": "📍 *Area:* Around your shared location",
        "map": "🗺️ *View on map:*\n{url}",
        "gis_note": "ℹ️ Results come from mapped data; road conditions and requested distances are not independently verified.",
        "candidate_note": "ℹ️ Imagery suggestions are not confirmed on-the-ground features.",
        "next": "Reply *MENU* to choose another service.",
        "road_title": "✅ *Road damage report saved*",
        "detected": "🕳️ *Possible potholes:* {count}\n*Status:* Awaiting field verification.",
        "zero": "*Result:* No clear pothole was identified.\nYour report has been saved for review.",
        "unavailable": "*Status:* Report saved. AI analysis is not available right now.",
        "road_failed": "*Status:* Report saved. AI analysis could not finish; review is pending.",
        "road_map": "📍 *View reported location:*\n{url}",
        "annotated": "🕳️ AI-marked pothole candidates · Not yet verified",
    },
    "hi": {
        "search_progress": "🔎 आपके भेजे स्थान के आसपास खोज रहे हैं…",
        "road_progress": "⏳ सड़क की फोटो जाँच रहे हैं…",
        "search_title": "🗺️ *GeoSathi खोज परिणाम*",
        "query": "*आपकी खोज:* {query}",
        "match": "*मिले:* {count} मानचित्र पर दर्ज {layer} फीचर",
        "example": "*उदाहरण:* {name}",
        "candidates": "*मिले:* {count} संभावित सैटेलाइट सुझाव",
        "candidate_example": "*प्रमुख सुझाव:* आपके चुने स्थान के पास",
        "none": "आपके भेजे स्थान के आसपास मिलते-जुलते स्थान नहीं मिले। दूसरा स्थान या व्यापक खोज आज़माएँ।",
        "not_ready": "अभी खोज सेवा उपलब्ध नहीं है। थोड़ी देर बाद प्रयास करें।",
        "failed": "खोज पूरी नहीं हो सकी। कृपया दोबारा प्रयास करें।",
        "area": "📍 *क्षेत्र:* आपके भेजे स्थान के आसपास",
        "map": "🗺️ *नक्शे पर देखें:*\n{url}",
        "gis_note": "ℹ️ नतीजे मानचित्र डेटा पर आधारित हैं; सड़क की स्थिति और बताई गई दूरी की स्वतंत्र पुष्टि नहीं हुई है।",
        "candidate_note": "ℹ️ सैटेलाइट सुझाव मौके पर सत्यापित नहीं किए गए हैं।",
        "next": "नई सेवा चुनने के लिए *MENU* लिखें।",
        "road_title": "✅ *सड़क क्षति रिपोर्ट सहेज ली गई*",
        "detected": "🕳️ *संभावित गड्ढे:* {count}\n*स्थिति:* मौके पर पुष्टि बाकी है।",
        "zero": "*नतीजा:* फोटो में स्पष्ट गड्ढा नहीं मिला।\nआपकी रिपोर्ट समीक्षा के लिए सहेज ली गई है।",
        "unavailable": "*स्थिति:* रिपोर्ट सहेजी गई। AI जाँच अभी उपलब्ध नहीं है।",
        "road_failed": "*स्थिति:* रिपोर्ट सहेजी गई। AI जाँच पूरी नहीं हो सकी; समीक्षा बाकी है।",
        "road_map": "📍 *रिपोर्ट की जगह देखें:*\n{url}",
        "annotated": "🕳️ AI द्वारा चिह्नित संभावित गड्ढे · पुष्टि बाकी है",
    },
    "mr": {
        "search_progress": "🔎 तुम्ही पाठवलेल्या ठिकाणाजवळ शोध सुरू आहे…",
        "road_progress": "⏳ रस्त्याच्या फोटोची तपासणी करत आहोत…",
        "search_title": "🗺️ *GeoSathi शोध निकाल*",
        "query": "*तुमचा शोध:* {query}",
        "match": "*सापडले:* {count} नकाशावर नोंदलेले {layer} घटक",
        "example": "*उदाहरण:* {name}",
        "candidates": "*सापडले:* {count} संभाव्य उपग्रह-प्रतिमा सूचना",
        "candidate_example": "*पहिली सूचना:* निवडलेल्या ठिकाणाजवळ",
        "none": "तुम्ही दिलेल्या ठिकाणाजवळ जुळणारे घटक सापडले नाहीत. दुसरे ठिकाण किंवा मोठे क्षेत्र वापरा.",
        "not_ready": "शोध सेवा सध्या उपलब्ध नाही. थोड्या वेळाने पुन्हा प्रयत्न करा.",
        "failed": "शोध पूर्ण झाला नाही. कृपया पुन्हा प्रयत्न करा.",
        "area": "📍 *क्षेत्र:* तुम्ही पाठवलेल्या ठिकाणाजवळ",
        "map": "🗺️ *नकाशावर पहा:*\n{url}",
        "gis_note": "ℹ️ निकाल नकाशा-नोंदींवर आधारित आहेत; रस्त्याची स्थिती आणि सांगितलेले अंतर स्वतंत्रपणे पडताळलेले नाही.",
        "candidate_note": "ℹ️ उपग्रह-प्रतिमेतील सूचना प्रत्यक्ष ठिकाणी सत्यापित नाहीत.",
        "next": "दुसरी सेवा निवडण्यासाठी *MENU* लिहा.",
        "road_title": "✅ *रस्ता नुकसान अहवाल जतन झाला*",
        "detected": "🕳️ *संभाव्य खड्डे:* {count}\n*स्थिती:* प्रत्यक्ष पडताळणी बाकी आहे.",
        "zero": "*निकाल:* फोटोमध्ये स्पष्ट खड्डा आढळला नाही.\nतुमचा अहवाल तपासणीसाठी जतन केला आहे.",
        "unavailable": "*स्थिती:* अहवाल जतन झाला. AI तपासणी सध्या उपलब्ध नाही.",
        "road_failed": "*स्थिती:* अहवाल जतन झाला. AI तपासणी पूर्ण झाली नाही; पडताळणी बाकी आहे.",
        "road_map": "📍 *नोंदवलेले ठिकाण पहा:*\n{url}",
        "annotated": "🕳️ AI ने दाखवलेले संभाव्य खड्डे · पडताळणी बाकी",
    },
}


def safe_text(value: object, limit: int = 120) -> str:
    """Keep visible Unicode text; discard multiline, control and bidi overrides."""
    text = "".join(c if unicodedata.category(c) not in {"Cf", "Cc", "Cs"} else " " for c in str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    text = text.replace("*", "").replace("`", "").replace("~", "")
    return text[:limit] if text else "—"


def part(language: str, key: str, **kwargs) -> str:
    return COPY.get(language, COPY["en"])[key].format(**kwargs)


def progress_message(language: str, mode: str) -> str:
    return part(language, "road_progress" if mode == "road" else "search_progress")


def search_message(language: str, query: str, *, mode: str, count: int = 0,
                   layer: str = "", name: str = "", map_url: str = "") -> str:
    lines = [part(language, "search_title"), "", part(language, "query", query=safe_text(query))]
    if mode in {"gis", "candidate"} and count > 0:
        if mode == "gis":
            lines.extend([part(language, "match", count=count, layer=safe_text(layer, 36)),
                          part(language, "example", name=safe_text(name, 72))])
        else:
            lines.extend([part(language, "candidates", count=count), part(language, "candidate_example")])
        lines.extend(["", part(language, "area"), part(language, "map", url=map_url), "",
                      part(language, "gis_note" if mode == "gis" else "candidate_note")])
    else:
        key = {"empty": "none", "unavailable": "not_ready", "error": "failed"}.get(mode, "failed")
        lines.extend(["", part(language, key)])
    lines.extend(["", part(language, "next")])
    return "\n".join(lines)


def road_message(language: str, state: str, *, count: int, map_url: str) -> str:
    key = {"detected": "detected", "zero": "zero", "unavailable": "unavailable", "error": "road_failed"}[state]
    return "\n".join([part(language, "road_title"), "", part(language, key, count=count), "",
                      part(language, "road_map", url=map_url), "", part(language, "next")])
