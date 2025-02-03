import * as THREE from "three";
import { IFCViewer } from "../app";
import { IFCModel } from "../types";

export class Sidebar {
  private viewer: IFCViewer;

  constructor(viewer: IFCViewer) {
    this.viewer = viewer;
    this.setupSettingsPanel();
    this.setupModelsPanel();
  }

  private setupSettingsPanel(): void {
    // Grid toggle
    const gridToggle = document.getElementById("grid-toggle") as HTMLInputElement;
    if (gridToggle) {
      gridToggle.addEventListener("change", () => {
        if (this.viewer.grid) {
          this.viewer.grid.visible = gridToggle.checked;
        }
      });
    }

    // Axes toggle
    const axesToggle = document.getElementById("axes-toggle") as HTMLInputElement;
    if (axesToggle) {
      axesToggle.addEventListener("change", () => {
        if (this.viewer.axes) {
          this.viewer.axes.visible = axesToggle.checked;
        }
      });
    }

    // Shadows toggle
    const shadowsToggle = document.getElementById("shadows-toggle") as HTMLInputElement;
    if (shadowsToggle) {
      shadowsToggle.addEventListener("change", () => {
        this.viewer.renderer.shadowMap.enabled = shadowsToggle.checked;
        this.viewer.models.forEach((model) => {
          model.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = shadowsToggle.checked;
              child.receiveShadow = shadowsToggle.checked;
            }
          });
        });
      });
    }

    // Opacity slider
    const opacitySlider = document.getElementById("opacity-slider") as HTMLInputElement;
    if (opacitySlider) {
      opacitySlider.addEventListener("input", () => {
        const opacity = Number(opacitySlider.value) / 100;
        this.viewer.models.forEach((model) => {
          model.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
              const material = (child as THREE.Mesh).material as THREE.Material;
              if (Array.isArray(material)) {
                material.forEach((m) => {
                  m.opacity = opacity;
                  m.transparent = opacity < 1;
                  m.needsUpdate = true;
                });
              } else {
                material.opacity = opacity;
                material.transparent = opacity < 1;
                material.needsUpdate = true;
              }
            }
          });
        });
      });
    }
  }

  private setupModelsPanel(): void {
    // Toggle models panel
    const modelsPanel = document.querySelector(".models-panel");
    const modelsToggle = document.querySelector(".models-toggle");
    if (modelsPanel && modelsToggle) {
      modelsToggle.addEventListener("click", () => {
        modelsPanel.classList.toggle("collapsed");
      });
    }
  }

  public createModelListItem(modelId: number, fileName: string, model: IFCModel): void {
    const modelsList = document.getElementById("models-list");
    if (!modelsList) return;

    const modelItem = document.createElement("div");
    modelItem.className = "model-item";
    modelItem.id = `model-${modelId}`;

    const modelHeader = document.createElement("div");
    modelHeader.className = "model-header";

    const modelName = document.createElement("div");
    modelName.className = "model-name";
    modelName.textContent = fileName;

    const modelControls = document.createElement("div");
    modelControls.className = "model-controls";

    // Visibility toggle button
    const visibilityBtn = document.createElement("button");
    visibilityBtn.className = "model-control-btn";
    visibilityBtn.innerHTML = '<i class="fas fa-eye"></i>';
    visibilityBtn.title = "Toggle Visibility";
    visibilityBtn.addEventListener("click", () => {
      model.visible = !model.visible;
      visibilityBtn.innerHTML = model.visible
        ? '<i class="fas fa-eye"></i>'
        : '<i class="fas fa-eye-slash"></i>';
    });

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "model-control-btn";
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.title = "Delete Model";
    deleteBtn.addEventListener("click", async () => {
      this.viewer.scene.remove(model);
      this.viewer.models.delete(modelId);
      modelItem.remove();
    });

    modelControls.appendChild(visibilityBtn);
    modelControls.appendChild(deleteBtn);
    modelHeader.appendChild(modelName);
    modelHeader.appendChild(modelControls);
    modelItem.appendChild(modelHeader);

    // Model info section
    const modelInfo = document.createElement("div");
    modelInfo.className = "model-info";

    // Get model information
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    modelInfo.innerHTML = `
      <div>Size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}</div>
      <div>Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})</div>
    `;

    // Add spatial tree section to model card
    const treeSection = document.createElement("div");
    treeSection.className = "model-tree-section";
    const treeContent = document.createElement("div");
    treeContent.className = "model-tree-content";
    treeContent.id = `model-tree-${modelId}`;
    treeSection.appendChild(treeContent);

    modelItem.appendChild(modelInfo);
    modelItem.appendChild(treeSection);
    modelsList.appendChild(modelItem);
  }
} 