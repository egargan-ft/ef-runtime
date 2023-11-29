import { EFRuntime, IRuntimeDependencies } from "./EFRuntime";
import { IComponentRegistry } from "../ComponentRegistry";
import { ModuleLoader, IModuleLoaderDependencies } from "../ModuleLoader";
import { StylingHandler } from "../StylingHandler";
import { logger } from "../utils/logger";

class MockStylingHandler extends StylingHandler {
  constructor(document: Document) {
    super(document);
  }
  addStyling = jest.fn();
}

class MockModuleLoader extends ModuleLoader {
  constructor(dependencies: IModuleLoaderDependencies) {
    super(dependencies);
  }
  init = jest.fn();
  importModule = jest.fn();
}

class MockLocalStorage {
  private store: { [key: string]: string };
  constructor() {
    this.store = {};
  }

  clear() {
    this.store = {};
  }

  getItem(key: string) {
    return this.store[key] || null;
  }

  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }

  removeItem(key: string) {
    delete this.store[key];
  }
}

describe("EFRuntime", () => {
  let mockRegistry: jest.Mocked<IComponentRegistry>;
  let mockModuleLoader: MockModuleLoader;
  let mockStylingHandler: MockStylingHandler;
  let dependencies: IRuntimeDependencies;
  let runtime: EFRuntime;

  beforeEach(() => {
    mockRegistry = {
      fetch: jest.fn(),
      getComponentInfo: jest.fn(),
      getComponentKeys: jest.fn().mockReturnValue([]),
      applyOverrides: jest.fn(),
      getRegistry: jest.fn().mockReturnValue({}),
    } as jest.Mocked<IComponentRegistry>;

    const mockDocument = {
      createElement: jest.fn(),
      head: {
        append: jest.fn(),
      },
    } as unknown as Document;

    const mockLocalStorage = new MockLocalStorage() as unknown as Storage;
    mockLocalStorage.setItem(
      "ef-overrides",
      JSON.stringify({ "some-component": "some-url" })
    );
    global.localStorage = mockLocalStorage;

    const moduleLoaderDependencies: IModuleLoaderDependencies = {
      document: mockDocument,
      loaderSrc: "someSrc",
      registry: mockRegistry,
    };

    mockModuleLoader = new MockModuleLoader(moduleLoaderDependencies);
    mockStylingHandler = new MockStylingHandler(mockDocument);

    dependencies = {
      componentRegistry: mockRegistry,
      moduleLoader: mockModuleLoader,
      stylingHandler: mockStylingHandler,
    };

    runtime = new EFRuntime(dependencies);
  });

  describe("init", () => {
    afterAll(() => {
      jest.restoreAllMocks();
    });

    it("throws an error if systemCode is not provided", async () => {
      await expect(runtime.init({})).rejects.toThrow(
        "Must provide a systemCode option"
      );
    });

    it("initialises the module loader and fetches registry", async () => {
      await runtime.init({ systemCode: "some-system-code" });

      expect(mockModuleLoader.init).toHaveBeenCalled();
      expect(mockRegistry.fetch).toHaveBeenCalledWith("some-system-code");
    });

    it("applies overrides if provided", async () => {
      const overrides = {
        "some-component": {
          js: "some-js-url",
          css: "some-css-url",
        },
      };
      await runtime.init({ systemCode: "some-system-code", overrides });

      expect(mockRegistry.applyOverrides).toHaveBeenCalledWith(overrides);
    });
  });

  describe("load", () => {
    it("logs an error if component is not found in registry", async () => {
      mockRegistry.getComponentInfo.mockReturnValue(undefined);
      const spyLogger = jest.spyOn(logger, "error");

      await runtime.load("some-component");

      expect(spyLogger).toHaveBeenCalledWith(
        "Failed to retrieve Info for component some-component"
      );
    });

    it("logs an error if js is missing from registry", async () => {
      mockRegistry.getComponentInfo.mockReturnValue({
        js: null,
        css: "some-css-url",
      });
      console.error = jest.fn();

      await runtime.load("some-component");

      expect(console.error).toHaveBeenCalledWith(
        "Missing JS URL for component some-component"
      );
    });

    it("logs an error if css is missing from registry", async () => {
      mockRegistry.getComponentInfo.mockReturnValue({
        js: "some-js-url",
        css: null,
      });
      console.error = jest.fn();

      await runtime.load("some-component");

      expect(console.error).toHaveBeenCalledWith(
        "Missing CSS URL for component some-component"
      );
    });

    it("logs an error if both js and css are missing from registry", async () => {
      mockRegistry.getComponentInfo.mockReturnValue({ js: null, css: null });
      console.error = jest.fn();

      await runtime.load("some-component");

      expect(console.error).toHaveBeenCalledWith(
        "Missing JS and CSS URL for component some-component"
      );
    });

    it("adds styling and imports module if component is found in registry", async () => {
      mockRegistry.getComponentInfo.mockReturnValue({
        js: "some-js-url",
        css: "some-css-url",
      });
      mockModuleLoader.importModule.mockResolvedValue({});

      await runtime.load("some-component");

      expect(mockStylingHandler.addStyling).toHaveBeenCalledWith(
        "some-css-url"
      );
      expect(mockModuleLoader.importModule).toHaveBeenCalledWith("some-js-url");
    });
  });
});
