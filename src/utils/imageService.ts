/**
 * Своя обработка картинок при сборке: то же, что делает Astro, плюс одно —
 * кадрирование по точке кадра, заданной в процентах.
 *
 * Зачем. Astro умеет обрезать кадр под нужную рамку (`fit: 'cover'`), но место
 * обрезки задаётся словами: `top`, `center`, `bottom`. Нашим шапкам этого мало:
 * у вертикального кадра сюжет стоит, например, на 68% высоты, и такую точку
 * словом не назвать. Без неё оставалось одно — отдавать браузеру кадр целиком
 * и резать полосу уже в нём, то есть качать вчетверо больше, чем видно (F1_P33).
 *
 * Что добавлено. Если в `position` пришли проценты («50% 68%»), кадр сначала
 * режется до пропорций рамки ровно так, как это сделал бы CSS
 * `object-fit: cover` с таким `object-position`, и только потом уменьшается.
 * Всё остальное — форматы, качество, размеры — по-прежнему делает Astro:
 * ниже вызывается его же обработчик, к нему только подкладывается обрезанный
 * кадр. Слова (`center` в превью ссылки, src/components/Seo.astro) и картинки
 * без `position` идут мимо этой ветки, как раньше.
 */
import sharpService from 'astro/assets/services/sharp';
import sharp from 'sharp';
import type { LocalImageService } from 'astro';

/** «50% 68%» — только проценты; всё прочее оставляем Astro. */
const PERCENTS = /^([\d.]+)%\s+([\d.]+)%$/;

const service: LocalImageService = {
  ...sharpService,

  async transform(buffer, transform, config) {
    const spot = PERCENTS.exec(String(transform.position ?? ''));
    if (!spot || !transform.width || !transform.height) {
      return sharpService.transform(buffer, transform, config);
    }

    const fx = Math.min(1, Math.max(0, Number(spot[1]) / 100));
    const fy = Math.min(1, Math.max(0, Number(spot[2]) / 100));

    // Размеры берём после поворота по EXIF: у повёрнутого кадра metadata()
    // отдаёт их так, как они лежат в файле, а резать надо то, что видно.
    const image = sharp(buffer, { failOn: 'none' }).rotate();
    const meta = await image.metadata();
    const width = meta.autoOrient?.width ?? meta.width;
    const height = meta.autoOrient?.height ?? meta.height;
    if (!width || !height) return sharpService.transform(buffer, transform, config);

    // Рамка обрезает кадр по одной стороне: та, что упирается в неё, остаётся
    // целиком. Проценты говорят, какая часть длинной стороны видна: 0% — начало
    // кадра, 100% — конец, ровно как в CSS.
    const box = transform.width / transform.height;
    const crop = {
      width: Math.min(width, Math.round(height * box)),
      height: Math.min(height, Math.round(width / box)),
      left: 0,
      top: 0,
    };
    crop.left = Math.round((width - crop.width) * fx);
    crop.top = Math.round((height - crop.height) * fy);

    const cropped = await image.extract(crop).toBuffer();
    return sharpService.transform(cropped, { ...transform, position: undefined }, config);
  },
};

export default service;
