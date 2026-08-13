# Glass Media Card

An iOS / Control-Center inspired media player card for Home Assistant — dark glass background, accent-color glow, a single focused entity (no device switcher), independent volume routing, and an Apple TV remote touchpad.

Built as a from-scratch, purpose-built alternative to the Crow Media Player Card, trimmed down to what one setup actually needs and extended with volume routing to a separate device and Apple TV remote support.

## Features

- **Compact + expanded views** — a small now-playing row that expands into a full glass panel with large artwork.
- **Independent volume routing** — control the volume of a *different* entity than the one playing media (e.g. route volume to a Denon/receiver while the Apple TV plays the content).
- **Apple TV remote pad** — up/down/left/right/select, back, home, and power, sent via `remote.send_command` to a `remote.*` entity.
- **Visual (UI) config editor** — no YAML required; entities are picked through Home Assistant's standard entity picker.
- **No external dependencies** — pure vanilla JS web component, system fonts only, works fully offline/on a LAN-only Home Assistant instance.

## Installation

### HACS (custom repository)

1. HACS → the **⋮** menu (top right) → **Custom repositories**
2. Add this repository URL, category **Dashboard**
3. Install **Glass Media Card**, then add the resource under Settings → Dashboards → Resources (HACS does this automatically for most installs — check if it's already listed first)

### Manual

1. Download `glass-media-card.js` from this repo
2. Copy it to `<config>/www/glass-media-card.js`
3. Settings → Dashboards → Resources → **Add Resource**
   - URL: `/local/glass-media-card.js`
   - Type: **JavaScript Module**
4. Restart Home Assistant (or hard-refresh with cache cleared)

## Usage

Add the card through the dashboard UI — search for **Glass Media Card** — and configure it with the visual editor, or use YAML:

```yaml
type: custom:glass-media-card
entity: media_player.living_room_apple_tv
volume_entity: media_player.denon_avr        # optional — defaults to `entity`
remote_entity: remote.living_room_apple_tv   # optional — omit to hide the Remote tab
name: Living Room                            # optional — overrides friendly_name
accent_color: '#0A84FF'                      # optional — iOS blue by default
```

### Options

| Name | Type | Required | Description |
|---|---|---|---|
| `entity` | string | Yes | The `media_player` entity to show artwork/title and drive play/pause/prev/next. |
| `volume_entity` | string | No | A separate entity (typically another `media_player`) whose volume the slider controls. Falls back to `entity`. |
| `remote_entity` | string | No | A `remote.*` entity used for the remote touchpad. If omitted, the Remote tab is hidden. |
| `name` | string | No | Overrides the entity's friendly name in the card header. |
| `accent_color` | string | No | Hex color used for the progress bar, volume fill, glow effects, and the select button. Defaults to `#0A84FF`. |

### Remote commands

Remote button presses call `remote.send_command` with the following command names by default:

```
up, down, left, right, select, menu (back), home
```

Different `remote.*` integrations expose different command vocabularies. If a button does nothing on your setup, check **Developer Tools → Actions → `remote.send_command`** against your `remote_entity` to see what it actually accepts, then edit the `REMOTE_COMMANDS` object near the top of `glass-media-card.js`.

## Credits

Concept and visual direction were inspired by [Crow Media Player Card](https://github.com/jamesmcginnis/crow-media-player-card) and [ATV Media Remote](https://github.com/jamesmcginnis/atv-media-remote), both by jamesmcginnis. This is an independent, from-scratch implementation — no code was copied from those projects.

## License

MIT — see [LICENSE](LICENSE).
