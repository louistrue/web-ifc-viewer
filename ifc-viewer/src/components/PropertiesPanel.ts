import { IFCViewer } from "../app";

export class PropertiesPanel {
  private panel: HTMLElement | null;
  private noSelection: HTMLElement | null;
  private elementInfo: HTMLElement | null;
  private attributesList: HTMLElement | null;
  private propertiesList: HTMLElement | null;
  private viewer: IFCViewer;

  constructor(viewer: IFCViewer) {
    this.viewer = viewer;
    this.initializeElements();
  }

  private initializeElements(): void {
    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.findElements());
    } else {
      this.findElements();
    }
  }

  private findElements(): void {
    this.panel = document.querySelector(".properties-panel");
    this.noSelection = document.querySelector(".no-selection");
    this.elementInfo = document.querySelector(".element-info");
    this.attributesList = document.getElementById("element-attributes");
    this.propertiesList = document.getElementById("element-properties");

    if (
      !this.panel ||
      !this.noSelection ||
      !this.elementInfo ||
      !this.attributesList ||
      !this.propertiesList
    ) {
      console.error("Failed to find all required properties panel elements");
    }
  }

  public setupPropertiesPanel(): void {
    // Toggle properties panel
    const propertiesPanel = document.querySelector(".properties-panel");
    const propertiesToggle = document.querySelector(".properties-toggle");

    if (propertiesPanel && propertiesToggle) {
      propertiesToggle.addEventListener("click", () => {
        propertiesPanel.classList.toggle("collapsed");

        // Adjust settings panel position if it exists
        const settingsPanel = document.querySelector(".settings-panel");
        if (settingsPanel instanceof HTMLElement) {
          if (propertiesPanel.classList.contains("collapsed")) {
            settingsPanel.style.right = "1rem";
          } else {
            settingsPanel.style.right = "calc(300px + 1rem)";
          }
        }
      });
    }
  }

  public displayElementProperties(props: any): void {
    // Verify elements exist
    if (
      !this.panel ||
      !this.noSelection ||
      !this.elementInfo ||
      !this.attributesList ||
      !this.propertiesList
    ) {
      console.error("Missing DOM elements");
      this.findElements(); // Try to find elements again
      if (
        !this.panel ||
        !this.noSelection ||
        !this.elementInfo ||
        !this.attributesList ||
        !this.propertiesList
      ) {
        return;
      }
    }

    try {
      // Show properties panel
      this.noSelection.style.display = "none";
      this.elementInfo.style.display = "block";
      this.panel.classList.remove("collapsed");

      // Clear previous content
      this.attributesList.innerHTML = "";
      this.propertiesList.innerHTML = "";

      // Display element info
      if (props.elementInfo) {
        Object.entries(props.elementInfo).forEach(([key, value]) => {
          this.addPropertyItem(this.attributesList!, key, value);
        });
      }

      // Display property sets
      if (props.propertysets?.length > 0) {
        const psetContainer = document.createElement("div");
        psetContainer.className = "property-group";
        psetContainer.innerHTML = "<h4>Property Sets</h4>";
        this.displayPropertyGroup(psetContainer, props.propertysets);
        this.propertiesList.appendChild(psetContainer);
      }

      // Display materials
      if (props.materials?.length > 0) {
        const materialContainer = document.createElement("div");
        materialContainer.className = "property-group";
        materialContainer.innerHTML = "<h4>Materials</h4>";
        this.displayMaterials(materialContainer, props.materials);
        this.propertiesList.appendChild(materialContainer);
      }

      // Display quantities
      if (props.quantities?.length > 0) {
        const quantityContainer = document.createElement("div");
        quantityContainer.className = "property-group";
        quantityContainer.innerHTML = "<h4>Quantities</h4>";
        this.displayPropertyGroup(quantityContainer, props.quantities);
        this.propertiesList.appendChild(quantityContainer);
      }
    } catch (error) {
      console.error("Error displaying properties:", error);
    }
  }

  private displayMaterials(container: HTMLElement, materials: any[]): void {
    materials.forEach((material) => {
      if (material.ForLayerSet) {
        this.displayMaterialLayerSet(container, material.ForLayerSet);
      } else {
        this.displayBasicMaterial(container, material);
      }
    });
  }

  private displayMaterialLayerSet(container: HTMLElement, layerSet: any): void {
    const layers = layerSet.MaterialLayers || [];
    layers.forEach((layer: any, index: number) => {
      const layerDiv = document.createElement("div");
      layerDiv.className = "material-layer";

      const layerHeader = document.createElement("h5");
      layerHeader.textContent = `Layer ${index + 1}: ${
        layer.Name?.value || "Unnamed Layer"
      }`;
      layerDiv.appendChild(layerHeader);

      if (layer.Material?.Name) {
        this.addPropertyItem(layerDiv, "Material", layer.Material.Name.value);
      }
      if (layer.LayerThickness) {
        const thickness = layer.LayerThickness.value * 1000; // Convert to mm
        this.addPropertyItem(
          layerDiv,
          "Thickness",
          `${thickness.toFixed(0)} mm`
        );
      }
      if (layer.IsVentilated !== null) {
        this.addPropertyItem(layerDiv, "Ventilated", layer.IsVentilated);
      }

      container.appendChild(layerDiv);
    });
  }

  private displayBasicMaterial(container: HTMLElement, material: any): void {
    if (material.Name) {
      this.addPropertyItem(container, "Name", material.Name.value);
    }
    if (material.Description) {
      this.addPropertyItem(
        container,
        "Description",
        material.Description.value
      );
    }
    if (material.Category) {
      this.addPropertyItem(container, "Category", material.Category.value);
    }
  }

  private displayPropertyGroup(
    container: HTMLElement,
    properties: any[]
  ): void {
    const list = document.createElement("div");
    list.className = "property-list";

    properties.forEach((prop) => {
      if (!prop) return;

      // Handle property set name
      if (prop.Name && prop.Name.value) {
        const groupName = document.createElement("h5");
        groupName.textContent = prop.Name.value;
        list.appendChild(groupName);
      }

      // Handle HasProperties array
      if (prop.HasProperties) {
        const propArray = Array.isArray(prop.HasProperties)
          ? prop.HasProperties
          : [prop.HasProperties];

        propArray.forEach((p) => {
          if (!p || !p.Name) return;

          const name = p.Name.value;
          let value;

          if (p.NominalValue) {
            value = p.NominalValue.value;
          } else if (p.Value) {
            value = p.Value.value;
          } else if (p.EnumValues) {
            value = p.EnumValues.map((v: any) => v.value).join(", ");
          }

          if (name && value !== undefined) {
            this.addPropertyItem(list, name, value);
          }
        });
      }
    });

    container.appendChild(list);
  }

  private addPropertyItem(
    container: HTMLElement,
    name: string,
    value: any
  ): void {
    const item = document.createElement("div");
    item.className = "property-item";

    // Format the value
    let displayValue = value;
    if (typeof value === "number") {
      displayValue = Number.isInteger(value) ? value : value.toFixed(2);
    } else if (typeof value === "object" && value !== null) {
      if (value.value !== undefined) {
        displayValue = value.value;
      } else {
        try {
          displayValue = JSON.stringify(value);
        } catch {
          displayValue = "[Complex Value]";
        }
      }
    }

    item.innerHTML = `
      <div class="property-name">${name}</div>
      <div class="property-value">${displayValue}</div>
    `;
    container.appendChild(item);
  }

  public clear(): void {
    if (!this.noSelection || !this.elementInfo) return;

    this.noSelection.style.display = "block";
    this.elementInfo.style.display = "none";
  }
}
