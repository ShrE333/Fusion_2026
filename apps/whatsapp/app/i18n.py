SUPPORTED_LANGUAGES = {"en", "hi", "mr"}

LANGUAGE_ALIASES = {
    "1": "en", "en": "en", "english": "en",
    "2": "hi", "hi": "hi", "hindi": "hi", "हिंदी": "hi", "हिन्दी": "hi",
    "3": "mr", "mr": "mr", "marathi": "mr", "मराठी": "mr",
}

MESSAGES = {
    "en": {
        "language_prompt": "🌐 Choose language / भाषा चुनें / भाषा निवडा\n\n1️⃣ English\n2️⃣ हिन्दी\n3️⃣ मराठी",
        "language_saved": "✅ Language set to English.",
        "menu": "👋 Welcome to GeoSathi AI!\n\n1️⃣ Infrastructure Search 🛰️\n2️⃣ Road Damage Report 🛣️\n\nReply 1 or 2. Type language to change language.",
        "road_prompt": "🛣️ Please send a clear pothole/road-damage photo (one image).",
        "infra_prompt": "🛰️ What do you want to locate?\nExample: Find buildings near drainage within 200m.\n\nSend your natural-language query.",
        "image_download_failed": "Could not download the image. Please resend a JPG/PNG/WEBP image.",
        "image_received": "📍 Image received! Send the road-damage location as a WhatsApp location pin.",
        "invalid_image": "Please send a JPG/PNG/WEBP photo of the road damage, or type menu.",
        "road_location_invalid": "Send a WhatsApp location pin for the road damage, or type menu.",
        "photo_expired": "Photo expired. Please send it again.",
        "processing_report": "⏳ Processing report {report_id} with GeoSathi AI...",
        "road_detected": "✅ GeoSathi Road Report {report_id}\n\n🕳️ AI pothole candidates: {count}\n🎯 Highest confidence: {confidence}\n⚡ AI inference: {latency}\n\n📍 Reported location: {lat:.5f}, {lon:.5f}\n🗺️ Map: {map_url}\n\nStatus: AI candidate — field verification pending.",
        "road_no_detection": "✅ GeoSathi Road Report {report_id}\n\nNo pothole candidate was detected above the configured confidence threshold.\nThe citizen report has still been saved for review.\n\n📍 Reported location: {lat:.5f}, {lon:.5f}\n🗺️ Map: {map_url}\n\nStatus: manual review recommended.",
        "road_not_configured": "✅ Report {report_id} saved.\n📍 Reported location: {lat:.5f}, {lon:.5f}\nAI road analysis is not configured yet; the report is retained for review.",
        "road_failed": "⚠️ Report {report_id} has been saved, but AI analysis is temporarily unavailable.\nThe submitted image and location are retained for review.\n📍 {lat:.5f}, {lon:.5f}\n🗺️ {map_url}",
        "infra_query_short": "Describe the infrastructure you want to find (at least 5 characters).",
        "infra_location_prompt": "📍 Please share the centre of the study area as a WhatsApp location pin. Search coverage depends on indexed imagery.",
        "infra_location_invalid": "Please share a WhatsApp location pin for the search area, or type menu.",
        "searching": "⏳ Searching imagery for {search_id}...",
        "search_found": "🛰️ Search {search_id} found {count} imagery candidate(s).\nTop candidate: {lat:.5f}, {lon:.5f}\nSkyCLIP similarity: {score}\nStatus: GIS verification pending.\nMap: {map_url}",
        "search_none": "🛰️ Search {search_id} completed, but no indexed imagery candidate was found near the shared pin.\nNo geographic match has been asserted.",
        "search_saved": "🛰️ Search {search_id} saved. Satellite image indexing/search is not connected yet. No geographic matches have been asserted.",
        "search_failed": "⚠️ Search {search_id} could not finish. Please retry later.",
    },
    "hi": {
        "language_prompt": "🌐 भाषा चुनें / Choose language / भाषा निवडा\n\n1️⃣ English\n2️⃣ हिन्दी\n3️⃣ मराठी",
        "language_saved": "✅ भाषा हिन्दी पर सेट कर दी गई है।",
        "menu": "👋 GeoSathi AI में आपका स्वागत है!\n\n1️⃣ इन्फ्रास्ट्रक्चर खोज 🛰️\n2️⃣ सड़क क्षति रिपोर्ट 🛣️\n\n1 या 2 भेजें। भाषा बदलने के लिए language या भाषा लिखें।",
        "road_prompt": "🛣️ गड्ढे/सड़क क्षति की एक साफ फोटो भेजें।",
        "infra_prompt": "🛰️ आप क्या खोजना चाहते हैं?\nउदाहरण: 200 मीटर के भीतर नाले के पास इमारतें खोजें।\n\nअपना प्रश्न सामान्य भाषा में भेजें।",
        "image_download_failed": "फोटो डाउनलोड नहीं हो सकी। कृपया JPG/PNG/WEBP फोटो दोबारा भेजें।",
        "image_received": "📍 फोटो मिल गई! अब सड़क क्षति का स्थान WhatsApp location pin के रूप में भेजें।",
        "invalid_image": "कृपया सड़क क्षति की JPG/PNG/WEBP फोटो भेजें, या menu लिखें।",
        "road_location_invalid": "सड़क क्षति का WhatsApp location pin भेजें, या menu लिखें।",
        "photo_expired": "फोटो उपलब्ध नहीं है। कृपया फोटो फिर से भेजें।",
        "processing_report": "⏳ रिपोर्ट {report_id} का GeoSathi AI से विश्लेषण हो रहा है...",
        "road_detected": "✅ GeoSathi सड़क रिपोर्ट {report_id}\n\n🕳️ AI गड्ढा उम्मीदवार: {count}\n🎯 सबसे अधिक confidence: {confidence}\n⚡ AI inference: {latency}\n\n📍 रिपोर्ट किया गया स्थान: {lat:.5f}, {lon:.5f}\n🗺️ मानचित्र: {map_url}\n\nस्थिति: AI उम्मीदवार — स्थल सत्यापन बाकी है।",
        "road_no_detection": "✅ GeoSathi सड़क रिपोर्ट {report_id}\n\nनिर्धारित confidence सीमा से ऊपर कोई गड्ढा उम्मीदवार नहीं मिला।\nनागरिक रिपोर्ट फिर भी समीक्षा के लिए सुरक्षित कर ली गई है।\n\n📍 रिपोर्ट किया गया स्थान: {lat:.5f}, {lon:.5f}\n🗺️ मानचित्र: {map_url}\n\nस्थिति: मैनुअल समीक्षा की सलाह।",
        "road_not_configured": "✅ रिपोर्ट {report_id} सुरक्षित कर ली गई है।\n📍 स्थान: {lat:.5f}, {lon:.5f}\nAI सड़क विश्लेषण अभी कॉन्फ़िगर नहीं है; रिपोर्ट समीक्षा के लिए रखी गई है।",
        "road_failed": "⚠️ रिपोर्ट {report_id} सुरक्षित है, लेकिन AI विश्लेषण अभी उपलब्ध नहीं है।\nफोटो और स्थान समीक्षा के लिए सुरक्षित हैं।\n📍 {lat:.5f}, {lon:.5f}\n🗺️ {map_url}",
        "infra_query_short": "कम से कम 5 अक्षरों में बताएं कि कौन-सा इन्फ्रास्ट्रक्चर खोजना है।",
        "infra_location_prompt": "📍 अध्ययन क्षेत्र का केंद्र WhatsApp location pin के रूप में साझा करें। खोज कवरेज indexed imagery पर निर्भर है।",
        "infra_location_invalid": "खोज क्षेत्र का WhatsApp location pin भेजें, या menu लिखें।",
        "searching": "⏳ {search_id} के लिए imagery खोजी जा रही है...",
        "search_found": "🛰️ खोज {search_id} में {count} imagery उम्मीदवार मिले।\nशीर्ष उम्मीदवार: {lat:.5f}, {lon:.5f}\nSkyCLIP similarity: {score}\nस्थिति: GIS सत्यापन बाकी है।\nमानचित्र: {map_url}",
        "search_none": "🛰️ खोज {search_id} पूरी हुई, लेकिन साझा स्थान के पास indexed imagery उम्मीदवार नहीं मिला।\nकिसी भौगोलिक मिलान की पुष्टि नहीं की गई है।",
        "search_saved": "🛰️ खोज {search_id} सुरक्षित कर ली गई है। Satellite imagery indexing/search अभी जुड़ी नहीं है। किसी भौगोलिक मिलान की पुष्टि नहीं की गई है।",
        "search_failed": "⚠️ खोज {search_id} पूरी नहीं हो सकी। कृपया फिर प्रयास करें।",
    },
    "mr": {
        "language_prompt": "🌐 भाषा निवडा / Choose language / भाषा चुनें\n\n1️⃣ English\n2️⃣ हिन्दी\n3️⃣ मराठी",
        "language_saved": "✅ भाषा मराठीवर सेट केली आहे.",
        "menu": "👋 GeoSathi AI मध्ये आपले स्वागत आहे!\n\n1️⃣ पायाभूत सुविधा शोध 🛰️\n2️⃣ रस्ता नुकसान अहवाल 🛣️\n\n1 किंवा 2 पाठवा. भाषा बदलण्यासाठी language किंवा भाषा लिहा.",
        "road_prompt": "🛣️ खड्डा/रस्ता नुकसान याचा एक स्पष्ट फोटो पाठवा.",
        "infra_prompt": "🛰️ तुम्हाला काय शोधायचे आहे?\nउदाहरण: 200 मीटरच्या आत नाल्याजवळील इमारती शोधा.\n\nतुमचा प्रश्न नैसर्गिक भाषेत पाठवा.",
        "image_download_failed": "फोटो डाउनलोड झाला नाही. कृपया JPG/PNG/WEBP फोटो पुन्हा पाठवा.",
        "image_received": "📍 फोटो मिळाला! आता रस्ता नुकसानीचे ठिकाण WhatsApp location pin म्हणून पाठवा.",
        "invalid_image": "कृपया रस्ता नुकसानीचा JPG/PNG/WEBP फोटो पाठवा, किंवा menu लिहा.",
        "road_location_invalid": "रस्ता नुकसानीचा WhatsApp location pin पाठवा, किंवा menu लिहा.",
        "photo_expired": "फोटो उपलब्ध नाही. कृपया पुन्हा फोटो पाठवा.",
        "processing_report": "⏳ अहवाल {report_id} चे GeoSathi AI द्वारे विश्लेषण सुरू आहे...",
        "road_detected": "✅ GeoSathi रस्ता अहवाल {report_id}\n\n🕳️ AI खड्डा उमेदवार: {count}\n🎯 सर्वाधिक confidence: {confidence}\n⚡ AI inference: {latency}\n\n📍 नोंदवलेले ठिकाण: {lat:.5f}, {lon:.5f}\n🗺️ नकाशा: {map_url}\n\nस्थिती: AI उमेदवार — प्रत्यक्ष पडताळणी बाकी आहे.",
        "road_no_detection": "✅ GeoSathi रस्ता अहवाल {report_id}\n\nठरवलेल्या confidence मर्यादेपेक्षा जास्त खड्डा उमेदवार आढळला नाही.\nनागरिक अहवाल तरीही तपासणीसाठी जतन केला आहे.\n\n📍 नोंदवलेले ठिकाण: {lat:.5f}, {lon:.5f}\n🗺️ नकाशा: {map_url}\n\nस्थिती: मॅन्युअल तपासणी सुचवली आहे.",
        "road_not_configured": "✅ अहवाल {report_id} जतन केला आहे.\n📍 ठिकाण: {lat:.5f}, {lon:.5f}\nAI रस्ता विश्लेषण अद्याप कॉन्फिगर केलेले नाही; अहवाल तपासणीसाठी जतन केला आहे.",
        "road_failed": "⚠️ अहवाल {report_id} जतन केला आहे, परंतु AI विश्लेषण सध्या उपलब्ध नाही.\nफोटो आणि ठिकाण तपासणीसाठी सुरक्षित आहेत.\n📍 {lat:.5f}, {lon:.5f}\n🗺️ {map_url}",
        "infra_query_short": "किमान 5 अक्षरांत कोणती पायाभूत सुविधा शोधायची ते सांगा.",
        "infra_location_prompt": "📍 अभ्यास क्षेत्राचे केंद्र WhatsApp location pin म्हणून शेअर करा. शोध कव्हरेज indexed imagery वर अवलंबून आहे.",
        "infra_location_invalid": "शोध क्षेत्राचा WhatsApp location pin पाठवा, किंवा menu लिहा.",
        "searching": "⏳ {search_id} साठी imagery शोधत आहे...",
        "search_found": "🛰️ शोध {search_id} मध्ये {count} imagery उमेदवार मिळाले.\nसर्वोच्च उमेदवार: {lat:.5f}, {lon:.5f}\nSkyCLIP similarity: {score}\nस्थिती: GIS पडताळणी बाकी आहे.\nनकाशा: {map_url}",
        "search_none": "🛰️ शोध {search_id} पूर्ण झाला, पण शेअर केलेल्या ठिकाणाजवळ indexed imagery उमेदवार मिळाला नाही.\nकोणत्याही भौगोलिक जुळणीची पुष्टी केलेली नाही.",
        "search_saved": "🛰️ शोध {search_id} जतन केला आहे. Satellite imagery indexing/search अद्याप जोडलेली नाही. कोणत्याही भौगोलिक जुळणीची पुष्टी केलेली नाही.",
        "search_failed": "⚠️ शोध {search_id} पूर्ण होऊ शकला नाही. कृपया पुन्हा प्रयत्न करा.",
    },
}


def normalize_language(value: str | None):
    if value is None:
        return None
    return LANGUAGE_ALIASES.get(str(value).strip().lower())


def t(language: str | None, key: str, **kwargs):
    lang = language if language in SUPPORTED_LANGUAGES else "en"
    template = MESSAGES.get(lang, MESSAGES["en"]).get(key, MESSAGES["en"][key])
    return template.format(**kwargs)
