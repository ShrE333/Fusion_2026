GeoSathi merge patch

Purpose:
- preserve the latest frontend branch at repository root
- merge member-1-whatsapp-vlm backend into retract
- add a server-side SkyCLIP adapter compatible with the updated frontend SearchResponse contract
- push retract, then fast-forward main

Usage:
1. Extract this ZIP into D:\fusion_2026_starter
2. Run PowerShell:
   cd D:\fusion_2026_starter
   powershell -ExecutionPolicy Bypass -File .\merge_to_retract_then_main.ps1

After push, configure Vercel:
NEXT_PUBLIC_API_BASE_URL=/api/skyclip
NEXT_PUBLIC_DISCOVERY_MODE=api
SKYCLIP_BASE_URL=https://YOUR-SKYCLIP-DOMAIN
SKYCLIP_SERVICE_TOKEN=<server-only token>

Do NOT prefix SKYCLIP_SERVICE_TOKEN with NEXT_PUBLIC_.
