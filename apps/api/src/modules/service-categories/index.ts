export { serviceCategoryRoutes } from './service-categories.routes.ts';
export * from './service-categories.schema.ts';
// CLI-443: services.service.ts (pricing lookup) o'z `categories` dep'iga muhtoj.
export { createServiceCategoriesService } from './service-categories.service.ts';
