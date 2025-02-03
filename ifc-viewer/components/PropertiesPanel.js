import * as THREE from "three";

export class PropertiesPanel {
  constructor() {
    this.selectedMaterial = new THREE.MeshPhongMaterial({
      color: 0xff9800,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
  }

  setupPropertiesPanel() {
    // Toggle properties panel
    const propertiesPanel = document.querySelector(".properties-panel");
    const propertiesToggle = document.querySelector(".properties-toggle");
    propertiesToggle.addEventListener("click", () => {
      propertiesPanel.classList.toggle("collapsed");
      // Adjust settings panel position
      const settingsPanel = document.querySelector(".settings-panel");
      if (propertiesPanel.classList.contains("collapsed")) {
        settingsPanel.style.right = "1rem";
      } else {
        settingsPanel.style.right = "calc(300px + 1rem)";
      }
    });
  }

  displayElementProperties(
    type,
    properties,
    psets,
    typeProps,
    materials,
    classifications,
    spatialInfo,
    quantities
  ) {
    const attributesList = document.getElementById("element-attributes");
    const propertiesList = document.getElementById("element-properties");

    // Clear previous content
    attributesList.innerHTML = "";
    propertiesList.innerHTML = "";

    // Display IFC type
    this.addPropertyItem(attributesList, "IFC Type", type.replace("IFC", ""));

    // Display direct properties
    if (properties) {
      const basicProps = [
        "expressID",
        "GlobalId",
        "Name",
        "ObjectType",
        "Tag",
        "Description",
        "PredefinedType",
      ];
      basicProps.forEach((key) => {
        if (properties[key]) {
          const value =
            properties[key].value !== undefined
              ? properties[key].value
              : properties[key];
          this.addPropertyItem(attributesList, key, value);
        }
      });
    }

    // Display property sets
    if (psets && psets.length > 0) {
      const psetContainer = document.createElement("div");
      psetContainer.className = "property-group";
      psetContainer.innerHTML = "<h4>Property Sets</h4>";
      this.displayPropertyGroup(psetContainer, psets);
      propertiesList.appendChild(psetContainer);
    }

    // Display type properties
    if (typeProps && typeProps.length > 0) {
      const typeContainer = document.createElement("div");
      typeContainer.className = "property-group";
      typeContainer.innerHTML = "<h4>Type Properties</h4>";
      typeProps.forEach((typeProp) => {
        const typeHeader = document.createElement("h5");
        typeHeader.textContent = typeProp.Name?.value || "Type Information";
        typeContainer.appendChild(typeHeader);

        Object.entries(typeProp).forEach(([key, value]) => {
          if (!key.startsWith("_") && value !== null && value !== undefined) {
            this.addPropertyItem(typeContainer, key, value.value || value);
          }
        });
      });
      propertiesList.appendChild(typeContainer);
    }

    // Display material properties
    if (materials && materials.length > 0) {
      const materialContainer = document.createElement("div");
      materialContainer.className = "property-group";
      materialContainer.innerHTML = "<h4>Material Properties</h4>";

      materials.forEach((material) => {
        const materialHeader = document.createElement("h5");
        materialHeader.textContent = material.Name?.value || "Material";
        materialContainer.appendChild(materialHeader);

        // Handle Material Layer Set
        if (material.ForLayerSet) {
          this.displayMaterialLayerSet(material, materialContainer);
        } else if (material.MaterialConstituents) {
          this.displayMaterialConstituents(material, materialContainer);
        } else {
          // Handle regular material properties
          Object.entries(material).forEach(([key, value]) => {
            if (!key.startsWith("_") && value !== null && value !== undefined) {
              this.addPropertyItem(
                materialContainer,
                key,
                value.value || value
              );
            }
          });
        }
      });
      propertiesList.appendChild(materialContainer);
    }

    // Display classifications
    if (classifications && classifications.length > 0) {
      this.displayClassifications(classifications, propertiesList);
    }

    // Display spatial information
    if (spatialInfo && spatialInfo.length > 0) {
      this.displaySpatialInfo(spatialInfo, propertiesList);
    }

    // Display quantity sets
    if (quantities && quantities.length > 0) {
      this.displayQuantitySets(quantities, propertiesList);
    }
  }

  displayMaterialLayerSet(material, materialContainer) {
    const layerSet = material.ForLayerSet;

    // Add layer set properties
    if (layerSet.LayerSetName) {
      this.addPropertyItem(
        materialContainer,
        "Layer Set Name",
        layerSet.LayerSetName.value
      );
    }
    if (layerSet.Description) {
      this.addPropertyItem(
        materialContainer,
        "Description",
        layerSet.Description.value
      );
    }
    if (material.LayerSetDirection) {
      this.addPropertyItem(
        materialContainer,
        "Layer Set Direction",
        material.LayerSetDirection
      );
    }
    if (material.DirectionSense) {
      this.addPropertyItem(
        materialContainer,
        "Direction Sense",
        material.DirectionSense
      );
    }
    if (material.OffsetFromReferenceLine) {
      this.addPropertyItem(
        materialContainer,
        "Offset From Reference Line",
        material.OffsetFromReferenceLine
      );
    }

    // Display layers
    if (layerSet.MaterialLayers) {
      this.displayMaterialLayers(layerSet.MaterialLayers, materialContainer);
    }
  }

  displayMaterialLayers(materialLayers, materialContainer) {
    const layers = Array.isArray(materialLayers)
      ? materialLayers
      : [materialLayers];

    const layersDiv = document.createElement("div");
    layersDiv.className = "material-layers";

    layers.forEach((layer, index) => {
      const layerDiv = document.createElement("div");
      layerDiv.className = "material-layer";

      const layerHeader = document.createElement("h6");
      layerHeader.textContent = `Layer ${index + 1}: ${
        layer.Name?.value || ""
      }`;
      layerDiv.appendChild(layerHeader);

      // Layer properties
      if (layer.Material?.Name) {
        this.addPropertyItem(layerDiv, "Material", layer.Material.Name.value);
      }
      if (layer.LayerThickness) {
        this.addPropertyItem(
          layerDiv,
          "Thickness",
          `${(layer.LayerThickness.value * 1000).toFixed(0)} mm`
        );
      }
      if (layer.IsVentilated !== null) {
        this.addPropertyItem(layerDiv, "Is Ventilated", layer.IsVentilated);
      }
      if (layer.Category) {
        this.addPropertyItem(layerDiv, "Category", layer.Category.value);
      }
      if (layer.Priority !== null) {
        this.addPropertyItem(layerDiv, "Priority", layer.Priority);
      }

      layersDiv.appendChild(layerDiv);
    });

    // Calculate and display total thickness
    const totalThickness = layers.reduce((sum, layer) => {
      return sum + (layer.LayerThickness?.value || 0);
    }, 0);
    this.addPropertyItem(
      materialContainer,
      "Total Thickness",
      `${(totalThickness * 1000).toFixed(0)} mm`
    );

    materialContainer.appendChild(layersDiv);
  }

  displayMaterialConstituents(material, materialContainer) {
    const constituents = Array.isArray(material.MaterialConstituents)
      ? material.MaterialConstituents
      : [material.MaterialConstituents];

    constituents.forEach((constituent, index) => {
      const constituentDiv = document.createElement("div");
      constituentDiv.className = "material-constituent";

      const constituentHeader = document.createElement("h6");
      constituentHeader.textContent = `Layer ${index + 1}: ${
        constituent.Name?.value || ""
      }`;
      constituentDiv.appendChild(constituentHeader);

      if (constituent.Material) {
        const material = constituent.Material;
        if (material.Name) {
          this.addPropertyItem(constituentDiv, "Material", material.Name.value);
        }
        if (material.Category) {
          this.addPropertyItem(
            constituentDiv,
            "Category",
            material.Category.value
          );
        }
        if (constituent.Fraction) {
          this.addPropertyItem(
            constituentDiv,
            "Fraction",
            constituent.Fraction
          );
        }
        if (constituent.Category) {
          this.addPropertyItem(
            constituentDiv,
            "Layer Category",
            constituent.Category.value
          );
        }
      }

      materialContainer.appendChild(constituentDiv);
    });
  }

  displayClassifications(classifications, propertiesList) {
    const classContainer = document.createElement("div");
    classContainer.className = "property-group";
    classContainer.innerHTML = "<h4>Classifications</h4>";
    classifications.forEach((classification) => {
      const classHeader = document.createElement("h5");
      classHeader.textContent = classification.Name?.value || "Classification";
      classContainer.appendChild(classHeader);

      Object.entries(classification).forEach(([key, value]) => {
        if (!key.startsWith("_") && value !== null && value !== undefined) {
          this.addPropertyItem(classContainer, key, value.value || value);
        }
      });
    });
    propertiesList.appendChild(classContainer);
  }

  displaySpatialInfo(spatialInfo, propertiesList) {
    const spatialContainer = document.createElement("div");
    spatialContainer.className = "property-group";
    spatialContainer.innerHTML = "<h4>Spatial Structure</h4>";
    spatialInfo.forEach((spatial) => {
      const spatialHeader = document.createElement("h5");
      spatialHeader.textContent = spatial.Name?.value || "Location";
      spatialContainer.appendChild(spatialHeader);

      Object.entries(spatial).forEach(([key, value]) => {
        if (!key.startsWith("_") && value !== null && value !== undefined) {
          this.addPropertyItem(spatialContainer, key, value.value || value);
        }
      });
    });
    propertiesList.appendChild(spatialContainer);
  }

  displayQuantitySets(quantities, propertiesList) {
    const quantityContainer = document.createElement("div");
    quantityContainer.className = "property-group";
    quantityContainer.innerHTML = "<h4>Quantities</h4>";

    quantities.forEach((quantitySet) => {
      const quantityHeader = document.createElement("h5");
      quantityHeader.textContent = quantitySet.Name?.value || "Quantity Set";
      quantityContainer.appendChild(quantityHeader);

      if (quantitySet.Quantities) {
        const quantities = Array.isArray(quantitySet.Quantities)
          ? quantitySet.Quantities
          : [quantitySet.Quantities];

        quantities.forEach((quantity) => {
          if (!quantity || !quantity.Name) return;

          const name = quantity.Name.value;
          let value;
          let unit = "";

          // Handle different quantity types
          if (quantity.LengthValue !== undefined) {
            value = quantity.LengthValue.value;
            unit = "m";
          } else if (quantity.AreaValue !== undefined) {
            value = quantity.AreaValue.value;
            unit = "m²";
          } else if (quantity.VolumeValue !== undefined) {
            value = quantity.VolumeValue.value;
            unit = "m³";
          } else if (quantity.WeightValue !== undefined) {
            value = quantity.WeightValue.value;
            unit = "kg";
          } else if (quantity.CountValue !== undefined) {
            value = quantity.CountValue.value;
          }

          if (name && value !== undefined) {
            // Format the value based on its magnitude
            let formattedValue;
            if (typeof value === "number") {
              if (value < 0.01) {
                formattedValue = value.toFixed(4);
              } else if (value < 1) {
                formattedValue = value.toFixed(3);
              } else if (value < 10) {
                formattedValue = value.toFixed(2);
              } else {
                formattedValue = value.toFixed(1);
              }
            } else {
              formattedValue = value;
            }

            this.addPropertyItem(
              quantityContainer,
              name,
              unit ? `${formattedValue} ${unit}` : formattedValue
            );
          }
        });
      }
    });

    propertiesList.appendChild(quantityContainer);
  }

  displayPropertyGroup(container, properties) {
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

          // Handle different property value types
          if (p.NominalValue) {
            if (typeof p.NominalValue === "object") {
              if (p.NominalValue.value !== undefined) {
                value = p.NominalValue.value;
              } else {
                // Try to get the first non-internal property
                const values = Object.entries(p.NominalValue)
                  .filter(([key]) => !key.startsWith("_"))
                  .map(([_, val]) => val);
                value = values[0];
              }
            } else {
              value = p.NominalValue;
            }
          } else if (p.Value) {
            value = p.Value.value;
          } else if (p.EnumValues) {
            value = p.EnumValues.map((v) => v.value).join(", ");
          } else if (p.ListValues) {
            value = p.ListValues.map((v) => v.value).join(", ");
          } else if (p.Unit) {
            value = `${p.Value?.value || ""} ${p.Unit.value || ""}`;
          }

          if (name && value !== undefined) {
            this.addPropertyItem(list, name, value);
          }
        });
      }

      // Handle direct properties (for non-standard property sets)
      Object.entries(prop).forEach(([key, value]) => {
        if (key !== "Name" && key !== "HasProperties" && !key.startsWith("_")) {
          if (typeof value === "object" && value !== null) {
            if (value.value !== undefined) {
              this.addPropertyItem(list, key, value.value);
            } else if (value.Name && value.Name.value) {
              this.addPropertyItem(list, key, value.Name.value);
            }
          } else if (value !== null && value !== undefined) {
            this.addPropertyItem(list, key, value);
          }
        }
      });
    });

    container.appendChild(list);
  }

  addPropertyItem(container, name, value) {
    if (value === undefined || value === null) return;

    // Format the value
    let displayValue = value;
    if (typeof value === "number") {
      // Format numbers with appropriate precision
      displayValue = Number.isInteger(value) ? value : value.toFixed(2);
    } else if (Array.isArray(value)) {
      displayValue = value.join(", ");
    } else if (typeof value === "object") {
      if (value.value !== undefined) {
        displayValue = value.value;
      } else if (value.Name && value.Name.value) {
        displayValue = value.Name.value;
      } else {
        try {
          displayValue = JSON.stringify(value);
        } catch {
          displayValue = "[Complex Value]";
        }
      }
    }

    const item = document.createElement("div");
    item.className = "property-item";
    item.innerHTML = `
      <div class="property-name">${name}</div>
      <div class="property-value">${displayValue}</div>
    `;
    container.appendChild(item);
  }
}
