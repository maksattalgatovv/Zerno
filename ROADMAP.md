# ZERNO roadmap

## Next: make the demo real

- Train a crop-symptom detector on wheat and barley photos from Kazakhstan, then enable the YOLO adapter
- Connect a real weather service
- Have a native speaker and an agronomist review the Kazakh text and all recommendations
- Draw field boundaries on the map, and import them from KML or Shapefile
- Send password reset and alert emails

## Hardening

- Rate limiting and account lockout on sign-in
- httpOnly cookie sessions with server-side revocation
- Authenticated image delivery with an S3-compatible backend
- Move flight tasks to a shared queue so the API can run several workers
- Docker images, CI and browser end-to-end tests in the repository
- Error monitoring and metrics

## Drones

- Upload real multispectral imagery and compute NDVI from it
- Integrate one drone through the manufacturer's SDK, starting with data import from manually flown missions
- Work with regulators on flight authorization in Kazakhstan
- No-fly zones, wind limits and geofencing in the pre-flight checks

## Farming features

- Compare NDVI between seasons and against the regional average
- Variable-rate irrigation and fertilizer maps
- Soil sensor data
- Field tasks assigned to workers, with an offline mobile view
- Agronomist accounts, shared farms and comments
- Yield estimates

## Business

- Pilot with farms in Akmola Region and measure the real effect on water use and inputs
- Cooperative and enterprise plans
- Reports formatted for subsidy programmes and lenders
