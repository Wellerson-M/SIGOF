---
name: Logistics & Freight Excellence
colors:
  surface: '#faf9fe'
  surface-dim: '#dad9de'
  surface-bright: '#faf9fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f8'
  surface-container: '#eeedf2'
  surface-container-high: '#e8e7ec'
  surface-container-highest: '#e3e2e7'
  on-surface: '#1a1c1f'
  on-surface-variant: '#43474f'
  inverse-surface: '#2f3034'
  inverse-on-surface: '#f1f0f5'
  outline: '#747780'
  outline-variant: '#c4c6d0'
  surface-tint: '#405f91'
  primary: '#001736'
  on-primary: '#ffffff'
  primary-container: '#002b5b'
  on-primary-container: '#7594ca'
  inverse-primary: '#a9c7ff'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#2f0c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#4f1c02'
  on-tertiary-container: '#cd805d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#a9c7ff'
  on-primary-fixed: '#001b3d'
  on-primary-fixed-variant: '#264778'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#713619'
  background: '#faf9fe'
  on-background: '#1a1c1f'
  surface-variant: '#e3e2e7'
typography:
  display:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  title-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.5'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  sidebar_width: 260px
  container_padding: 32px
  card_gap: 24px
  inline_padding: 12px
  stack_padding: 16px
---

## Brand & Style

The brand personality is rooted in **efficiency, reliability, and precision**. As a Freight Occurrence Management System (SIGOF), the UI must communicate a sense of absolute control and systematic order. The target audience consists of logistics managers and operations coordinators who require a high-density, low-friction interface to resolve critical shipping issues.

This design system adopts a **Corporate / Modern** style. It prioritizes clarity and functional density over decorative elements. The visual language uses generous whitespace to separate complex data sets, ensuring that "Urgente" (Urgent) tasks are immediately identifiable without overwhelming the user. The aesthetic is clean and professional, utilizing a structured grid and subtle depth to organize information hierarchy effectively.

## Colors

The palette is designed for a high-stakes corporate environment where color is used functionally rather than decoratively.

- **Primary (Navy Blue):** Used for the sidebar, primary actions, and navigational headers. It evokes trust and institutional stability.
- **Background:** A cool-toned light gray (#F4F7F9) reduces eye strain and provides a neutral canvas for data cards.
- **Surface:** Pure white is reserved for cards and content containers, creating a clear "layer" above the background.
- **Semantic Accents:** These follow the traffic-light convention strictly. **Verde** for resolved issues, **Amarelo** for ongoing alerts, and **Vermelho** for immediate threats/delays.
- **Neutrals:** A scale of Slate Grays is used for typography and borders to maintain a professional, de-saturated look that lets the status colors pop.

## Typography

The typography system utilizes **Inter** to leverage its exceptional legibility in data-heavy SaaS environments. 

- **Hierarchy:** Strong contrast between semi-bold headings and regular body weights helps users scan freight details quickly.
- **Labels:** Small, uppercase labels with slightly increased letter spacing are used for table headers and metadata categories.
- **Numbers:** Since this is a management system, tabular lining (monospaced numbers) should be used within data tables to ensure numerical values align vertically for easier comparison.
- **Language:** All terminology must follow standard Brazilian Portuguese business nomenclature (e.g., "Ocorrência", "Destinatário", "Manifesto").

## Layout & Spacing

This design system employs a **Fixed Sidebar Grid** model tailored for desktop productivity.

- **Sidebar:** A fixed left-hand navigation (260px) in Navy Blue provides persistent access to "Dashboard", "Ocorrências", "Relatórios", and "Configurações".
- **Main Canvas:** Content resides in a fluid area with a maximum width to prevent excessively long line lengths. It uses a 12-column grid with 24px gutters.
- **Rhythm:** Spacing follows an 8px base unit. 16px (2x) is the standard for internal card padding, while 32px (4x) is used for major section margins.
- **Mobile Adaptivity:** On smaller screens, the sidebar collapses into a hamburger menu or a bottom navigation bar, and the 12-column grid collapses into a single-column vertical stack.

## Elevation & Depth

To maintain a professional and clean aesthetic, the design system avoids heavy shadows. Depth is communicated through:

- **Tonal Layering:** The primary level is the light gray background. Content "floats" on pure white cards.
- **Soft Shadows:** Cards and dropdowns use a very soft, diffused shadow (`0px 4px 12px rgba(0, 0, 0, 0.05)`) to provide just enough separation from the background without feeling heavy or "skeuomorphic."
- **Focus States:** Active inputs and selected sidebar items use a subtle 2px inset or border in the Primary Navy color to denote focus, ensuring clear interactive feedback.
- **Borders:** A thin 1px border (#E2E8F0) is used to define table rows and internal card divisions, replacing shadows for interior structural elements.

## Shapes

The shape language is **Rounded (8px)**, striking a balance between modern friendliness and corporate discipline.

- **Standard Elements:** Buttons, input fields, and cards all share a 0.5rem (8px) corner radius.
- **Badges/Chips:** Status indicators (e.g., "Em trânsito") use a pill-shaped radius (full round) to distinguish them from interactive buttons.
- **Icons:** Use a consistent stroke weight (1.5px or 2px) with slightly rounded terminals to match the UI's geometry.

## Components

- **Buttons:** Primary buttons are solid Navy (#002B5B) with white text. Secondary buttons use a ghost style (outline) or a light gray fill.
- **Status Chips:** Small badges with a subtle background tint and dark text (e.g., Light Red background with Dark Red text for "Urgente").
- **Data Tables:** High-density rows with 12px vertical padding. Use "Zebra striping" (alternating #F8FAFC) only for tables exceeding 20 rows.
- **Input Fields:** White background with a 1px Slate-200 border. On focus, the border transitions to Primary Navy with a faint glow.
- **Cards:** The primary container for information. Cards must have a clear title, optional actions in the top-right corner, and consistent internal padding of 24px.
- **Sidebar Items:** High-contrast icons (white/light blue) on the dark navy background. The active state is marked by a solid primary-light vertical bar on the left.
- **KPI Widgets:** Large numerical displays with a trend indicator (arrow up/down) to show freight performance metrics at a glance.