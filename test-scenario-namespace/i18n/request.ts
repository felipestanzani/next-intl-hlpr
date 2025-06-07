import {getRequestConfig} from 'next-intl/server';

export default getRequestConfig(async ({requestLocale}) => {
  const locale = requestLocale || 'en';

  const pages = (await import(`../../messages/${locale}/pages.json`)).default;
  const validations = (
    await import(`../../messages/${locale}/validations.json`)
  ).default;

  return {
    locale,
    messages: {
      pages,
      validations
    }
  };
});
