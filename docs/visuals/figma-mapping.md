# Карта ассетов → Figma

| Asset ID | Figma layer | Формат | Рабочее соотношение |
|---|---|---|---|
| `hero-north-steam` | `IMAGE / HERO_DESKTOP` | Hero | 16:9 / 8:5 |
| `hero-north-steam-mobile` | `IMAGE / HERO_MOBILE` | Hero mobile | 4:5 |
| `format-barrel` | `IMAGE / BARREL` | Карточка формата | 3:2 |
| `format-quadro` | `IMAGE / QUADRO` | Карточка формата | 3:2 |
| `format-frame` | `IMAGE / FRAME` | Карточка формата | 3:2 |
| `format-trailer` | `IMAGE / TRAILER` | Карточка формата | 3:2 |
| `project-frame-main` | `IMAGE / PROJECT_MAIN` | Проект desktop | 4:5 / 1:1 |
| `project-frame-mobile` | `IMAGE / PROJECT_MOBILE` | Проект mobile | 7:5 |
| `product-frame-main` | `IMAGE / PRODUCT_MAIN` | Карточка модели | 1:1 |
| `final-cta` | `IMAGE / FINAL_CTA` | Финальный CTA | 16:5 |

## Технические требования

- хранить оригинал и web-версию отдельно;
- production: AVIF/WebP + JPEG fallback;
- сохранять фокус-точку в manifest;
- не зашивать текст и градиенты в фотографию;
- затемнение, цветокоррекция и overlay выполняются интерфейсом;
- одна фотография может иметь отдельные desktop/mobile crops.
