# Tools and skills user journey · 0.2.4

[简体中文](CAPABILITY_JOURNEY.zh-CN.md) · [繁體中文](CAPABILITY_JOURNEY.zh-TW.md)

2026-10-22: both real-model tasks and UI checks passed on the extracted final 0.2.4 ZIP. Original credentials, model settings and environment fingerprints remained unchanged; temporary settings were removed. See the [complete receipt](acceptance/real-capabilities-0.2.4-2026-10-22.json) and [updated tools page](images/ui-0.2.4/tools-final.png). Component, connection recovery and model-capability tests passed, as did six-page and narrow-window regression. Earlier workspace-selection timing, an unexplained page change and a screenshot timeout are retained as unsuccessful attempts in the receipt.

The deliverable is `release/Kuade Harness-0.2.4-win.zip`, extracted locally at `D:\K024z-1022\Kuade.exe`. The existing 0.2.3 user window was preserved; this run did not switch that instance automatically. Exit the old window before using the new executable.

Enable the required capabilities on the tools page. Each card shows connection progress, the number of registered tools, or a connection problem. The switch reflects saved configuration; registration indicates callable tools, not successful task completion.

“Try it” places an example in the composer without sending it. Existing drafts are preserved. Selecting a project skill adds it to the current request without duplicating the same prefix. Search, browser and computer operations have readable Chinese labels; expandable details retain original identifiers and output.

The computer card distinguishes declared image input from accessible window controls. A model without image input may operate applications with readable controls. Canvas interfaces and visual targeting require separate validation. Image support is never inferred from a model name.

This acceptance uses the user's configured Kimi K3 with temporary model settings in an isolated profile. It starts with the actual tool switches and skill button. The real model loads a project skill, searches the internet, reads Electron's official documentation and submits a local form through Playwright MCP. An independent HTTP server verifies a random marker and documentation URL. Bundled qwen_computer operates a dedicated Windows window; both its Accepted observation and an independent output file are checked. These operations use no simulated model.

Temporary model settings are removed afterward and original settings/environment fingerprints are compared. Other desktop applications, arbitrary websites, macOS and overnight operation are outside this run. The configured Kimi K3 reports that tool images were not sent to the model. The desktop acceptance therefore covers accessible controls and actions, not screenshot vision.
