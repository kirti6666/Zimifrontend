Facebetter sample effects, copied without modification from
https://github.com/pixpark/facebetter-sdk/tree/a7c8df67e450d4c5d3d88719080b45e4ff758700/demo/web/react/public

Embedded filters: assets/filters/portrait/{natural,milk_tea,rose,japanese,vivid}/<name>.fbd
Embedded stickers: stickers/face/{fox,black_glass,kiss2,mustache,fan_club}.fbd
These ten files are flattened into effects/<name>.fbd without changing their bytes.

The full demo's 19 filters, 11 stickers, five background images and optional
resource_3d.fbd/resource_body.fbd models are loaded only when needed from the
backend's pinned /api/v1/facebetter/runtime/2.2.1/ asset routes.

The matching option catalog and English labels are adapted from the demo's
src/catalog.js and src/i18n.jsx in ../beauty-catalog.js. The catalog retains
the SDK's original defaults, enum values, parameter ranges and resource ids.

The accompanying LICENSE is retained from that repository.
The build embeds these files as bytes; there are no runtime GitHub requests.
The Facebetter npm SDK is pinned to 2.2.1. Its matching runtime is served by
the authenticated app's backend at /api/v1/facebetter/runtime/2.2.1/.
