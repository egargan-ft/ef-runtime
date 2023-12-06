import { IComponentRegistry } from "../ComponentRegistry";
import { ModuleLoader } from "../ModuleLoader";
import { StylingHandler } from "../StylingHandler";
import { Logger } from "../Logger";

export interface IRuntimeDependencies {
  componentRegistry: IComponentRegistry;
  moduleLoader: ModuleLoader;
  stylingHandler: StylingHandler;
  logger: Logger;
  localStorage: Storage;
}

export class EFRuntime {
  private registry: IComponentRegistry;
  private moduleLoader: ModuleLoader;
  private stylingHandler: StylingHandler;
  private logger: Logger;
  private localStorage: Storage;

  constructor({
    componentRegistry,
    moduleLoader,
    stylingHandler,
    logger,
    localStorage,
  }: IRuntimeDependencies) {
    this.registry = componentRegistry;
    this.moduleLoader = moduleLoader;
    this.stylingHandler = stylingHandler;
    this.logger = logger;
    this.localStorage = localStorage;
  }

  private validateOptions(options: {
    systemCode?: string;
    overrides?: { [propName: string]: { js: string; css: string } };
  }): void {
    if (!options.systemCode) {
      this.logger.error("Must provide a systemCode option");
      throw new Error("Must provide a systemCode option");
    }
  }

  async init(
    options: {
      systemCode?: string;
      overrides?: { [propName: string]: { js: string; css: string } };
    } = {}
  ): Promise<void> {
    this.validateOptions(options);

    await this.registry.fetch(options.systemCode as string);

    if (options.overrides) {
      this.registry.applyOverrides(options.overrides);
    }

    const localOverrides = this.localStorage.getItem("ef-overrides");
    if (localOverrides) {
      this.registry.applyOverrides(JSON.parse(localOverrides));
    }

    await this.moduleLoader.init();
    this.loadAll();
  }

  loadAll(): void {
    const components = this.registry.getRegistry();
    for (const component in components) {
      this.load(component).catch((error) =>
        this.logger.error(`Error loading ${component}`, error)
      );
    }
  }

  async load(component: string): Promise<void> {
    const urlInfo = this.getComponentURL(component);
    if (!urlInfo) return;

    const { js, css } = urlInfo;
    if (!this.isValidURL(js, css, component)) return;

    await this.loadComponent(js, css, component);
  }

  private getComponentURL(component: string) {
    const urlInfo = this.registry.getURL(component);
    if (!urlInfo) {
      this.logger.error(`Failed to retrieve URL for component ${component}`);
    }
    return urlInfo;
  }

  private isValidURL(
    js: string | null,
    css: string | null,
    component: string
  ): boolean {
    let isValid = true;
    let missingParts: string[] = [];

    if (!js) {
      missingParts.push("JS");
      isValid = false;
    }

    if (!css) {
      missingParts.push("CSS");
      isValid = false;
    }

    if (!isValid) {
      this.logger.error(
        `Missing ${missingParts.join(" and ")} URL for component ${component}`
      );
    }

    return isValid;
  }

  private async loadComponent(js: string, css: string, component: string) {
    this.stylingHandler.addStyling(css);
    try {
      const componentModule = await this.moduleLoader.importModule(js);
      this.executeLifecycleMethods(componentModule);
    } catch (error) {
      this.logger.error(
        `Failed to load component ${component} using SystemJS`,
        error
      );
    }
  }

  private async executeLifecycleMethods(componentModule: any): Promise<void> {
    if (componentModule?.init) await componentModule.init();
    if (componentModule?.mount) await componentModule.mount();
  }
}
