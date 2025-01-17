import { ref, Ref, shallowRef } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { IfcAPI } from "web-ifc";
import type {
  IFCModel,
  IFCElement,
  SelectedObject,
  TreeNode,
} from "@/types/ifc";

// IFC type constants
const IFCPROJECT = 0x11;
const IFCSITE = 0x14;
const IFCBUILDING = 0x15;
const IFCBUILDINGSTOREY = 0x16;

interface IFCViewerOptions {
  onLoadingStart?: () => void;
  onLoadingEnd?: () => void;
  onElementSelected?: (element: IFCElement | null) => void;
}

export function useIFCViewer(options: IFCViewerOptions = {}) {
  const models: Ref<Map<number, IFCModel>> = ref(new Map());
  const modelCounter = ref(0);
  const scene = shallowRef<THREE.Scene | null>(null);
  const camera = shallowRef<THREE.PerspectiveCamera | null>(null);
  const renderer = shallowRef<THREE.WebGLRenderer | null>(null);
  const controls = shallowRef<OrbitControls | null>(null);
  const ifcAPI = shallowRef<IfcAPI | null>(null);
  const selectedObject = shallowRef<SelectedObject | null>(null);
  const grid = shallowRef<THREE.GridHelper | null>(null);
  const axes = shallowRef<THREE.AxesHelper | null>(null);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const selectedMaterial = new THREE.MeshPhongMaterial({
    color: 0xff9800,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });

  async function initViewer(container: HTMLElement) {
    try {
      options.onLoadingStart?.();

      // Initialize scene
      const newScene = new THREE.Scene();
      newScene.background = new THREE.Color(0xf0f0f0);
      scene.value = newScene;

      // Initialize camera
      const newCamera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
      );
      newCamera.position.set(10, 10, 10);
      newCamera.lookAt(0, 0, 0);
      camera.value = newCamera;

      // Initialize renderer
      const newRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        logarithmicDepthBuffer: true,
      });
      newRenderer.setSize(container.clientWidth, container.clientHeight);
      newRenderer.setPixelRatio(window.devicePixelRatio);
      newRenderer.shadowMap.enabled = true;
      newRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(newRenderer.domElement);
      renderer.value = newRenderer;

      // Initialize controls
      const newControls = new OrbitControls(newCamera, newRenderer.domElement);
      newControls.enableDamping = true;
      newControls.dampingFactor = 0.05;
      newControls.screenSpacePanning = true;
      newControls.minDistance = 1;
      newControls.maxDistance = 1000;
      newControls.maxPolarAngle = Math.PI / 1.75;
      controls.value = newControls;

      // Initialize IFC API
      const api = new IfcAPI();
      await api.Init();
      ifcAPI.value = api;

      // Add lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      newScene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(5, 10, 5);
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.near = 0.5;
      directionalLight.shadow.camera.far = 500;
      newScene.add(directionalLight);

      // Add grid helper
      const newGrid = new THREE.GridHelper(50, 50);
      newGrid.position.set(0, -0.01, 0); // Slightly below objects
      grid.value = newGrid;
      newScene.add(newGrid);

      // Add axes helper
      const newAxes = new THREE.AxesHelper(5);
      axes.value = newAxes;
      newScene.add(newAxes);

      // Setup event listeners
      window.addEventListener("resize", onWindowResize);
      container.addEventListener("click", handleClick);
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("dblclick", handleDoubleClick);

      // Start animation loop
      animate();
    } catch (error) {
      console.error("Error initializing IFC viewer:", error);
      throw error;
    } finally {
      options.onLoadingEnd?.();
    }
  }

  function handleClick(event: MouseEvent) {
    if (event.button !== 0) return; // Only handle left click

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (!scene.value || !camera.value) return;

    raycaster.setFromCamera(mouse, camera.value);
    const intersects = raycaster.intersectObjects(scene.value.children, true);

    // Clear previous selection
    if (selectedObject.value) {
      if (
        selectedObject.value.material &&
        selectedObject.value.originalMaterial
      ) {
        selectedObject.value.material = selectedObject.value.originalMaterial;
      }
      selectedObject.value = null;
    }

    if (intersects.length > 0) {
      const object = intersects[0].object as THREE.Mesh;
      let parent = object.parent;
      while (parent && !parent.name.startsWith("Element_")) {
        parent = parent.parent;
      }

      if (parent) {
        const expressID = parseInt(parent.name.split("_")[1]);
        const model = Array.from(models.value.values()).find(
          (m) => m.object === parent?.parent
        );

        if (model && object instanceof THREE.Mesh) {
          const material = object.material as THREE.Material;
          const selectedObj = object as unknown as SelectedObject;
          selectedObj.modelID = model.modelID;
          selectedObj.expressID = expressID;
          selectedObj.originalMaterial = material;
          selectedObj.material = selectedMaterial;
          selectedObject.value = selectedObj;

          selectObject(model.modelID, expressID);
        }
      }
    } else {
      clearSelection();
    }
  }

  function handleDoubleClick(event: MouseEvent) {
    if (!selectedObject.value || !camera.value || !controls.value) return;

    const box = new THREE.Box3().setFromObject(selectedObject.value);
    const center = box.getCenter(new THREE.Vector3());

    controls.value.target.copy(center);
    camera.value.lookAt(center);
    controls.value.update();
  }

  function handleMouseMove(event: MouseEvent) {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (!scene.value || !camera.value) return;

    raycaster.setFromCamera(mouse, camera.value);
    const intersects = raycaster.intersectObjects(scene.value.children, true);

    if (intersects.length > 0) {
      const object = intersects[0].object;
      let parent = object.parent;
      while (parent && !parent.name.startsWith("Element_")) {
        parent = parent.parent;
      }

      if (parent) {
        (event.target as HTMLElement).style.cursor = "pointer";
      } else {
        (event.target as HTMLElement).style.cursor = "default";
      }
    } else {
      (event.target as HTMLElement).style.cursor = "default";
    }
  }

  async function selectObject(modelID: number, expressID: number) {
    if (!ifcAPI.value) return;

    try {
      const props = await ifcAPI.value.GetLine(modelID, expressID, true);
      const element: IFCElement = {
        modelID,
        expressID,
        type: props.__proto__.constructor.name,
        name: props.Name?.value,
        properties: props,
      };

      options.onElementSelected?.(element);
    } catch (error) {
      console.error("Error getting element properties:", error);
    }
  }

  function clearSelection() {
    if (selectedObject.value) {
      if (
        selectedObject.value.material &&
        selectedObject.value.originalMaterial
      ) {
        selectedObject.value.material = selectedObject.value.originalMaterial;
      }
      selectedObject.value = null;
    }
    options.onElementSelected?.(null);
  }

  function onWindowResize() {
    if (camera.value && renderer.value) {
      const container = renderer.value.domElement.parentElement;
      if (!container) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      camera.value.aspect = width / height;
      camera.value.updateProjectionMatrix();
      renderer.value.setSize(width, height, false);
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.value?.update();
    if (scene.value && camera.value && renderer.value) {
      renderer.value.render(scene.value, camera.value);
    }
  }

  async function loadIFC(file: File) {
    try {
      options.onLoadingStart?.();

      if (!ifcAPI.value || !scene.value) {
        throw new Error("IFC API or scene not initialized");
      }

      const data = await file.arrayBuffer();
      const modelID = ifcAPI.value.OpenModel(new Uint8Array(data), {
        COORDINATE_TO_ORIGIN: true,
        USE_FAST_BOOLS: true,
      });

      const modelObject = new THREE.Group();
      modelObject.name = file.name;

      const model: IFCModel = {
        object: modelObject,
        modelID,
        name: file.name,
        visible: true,
        ifcAPI: ifcAPI.value,
      };

      // Process model geometry
      await processModelGeometry(modelID, model);

      // Add to scene and store reference
      scene.value.add(modelObject);
      const modelId = ++modelCounter.value;
      models.value.set(modelId, model);

      // Focus camera on model
      focusCameraOnModel(modelObject);

      // Build spatial tree
      await buildSpatialTree(modelID);
    } catch (error) {
      console.error("Error loading IFC file:", error);
    } finally {
      options.onLoadingEnd?.();
    }
  }

  async function buildSpatialTree(
    modelID: number
  ): Promise<TreeNode | undefined> {
    if (!ifcAPI.value) return;

    try {
      const project = await ifcAPI.value.GetLine(modelID, IFCPROJECT, true);
      const projectNode: TreeNode = {
        expressID: project.expressID,
        type: "IFCPROJECT",
        name: project.Name ? project.Name.value : "Project",
        children: [],
      };

      // Get all sites
      if (project.Sites) {
        for (const siteRef of project.Sites) {
          const site = await ifcAPI.value.GetLine(modelID, siteRef.value, true);
          const siteNode: TreeNode = {
            expressID: site.expressID,
            type: "IFCSITE",
            name: site.Name ? site.Name.value : "Site",
            children: [],
          };

          // Get all buildings
          if (site.Buildings) {
            for (const buildingRef of site.Buildings) {
              const building = await ifcAPI.value.GetLine(
                modelID,
                buildingRef.value,
                true
              );
              const buildingNode: TreeNode = {
                expressID: building.expressID,
                type: "IFCBUILDING",
                name: building.Name ? building.Name.value : "Building",
                children: [],
              };

              // Get all storeys
              if (building.BuildingStoreys) {
                for (const storeyRef of building.BuildingStoreys) {
                  const storey = await ifcAPI.value.GetLine(
                    modelID,
                    storeyRef.value,
                    true
                  );
                  const storeyNode: TreeNode = {
                    expressID: storey.expressID,
                    type: "IFCBUILDINGSTOREY",
                    name: storey.Name ? storey.Name.value : "Storey",
                    children: [],
                  };

                  buildingNode.children.push(storeyNode);
                }
              }

              siteNode.children.push(buildingNode);
            }
          }

          projectNode.children.push(siteNode);
        }
      }

      return projectNode;
    } catch (error) {
      console.error("Error building spatial tree:", error);
    }
  }

  async function processModelGeometry(modelID: number, model: IFCModel) {
    if (!ifcAPI.value) return;

    ifcAPI.value.StreamAllMeshes(modelID, (mesh) => {
      const placedGeometries = mesh.geometries;
      const expressID = mesh.expressID;

      const elementGroup = new THREE.Group();
      elementGroup.name = `Element_${expressID}`;

      for (let i = 0; i < placedGeometries.size(); i++) {
        const placedGeometry = placedGeometries.get(i);
        const geometry = getBufferGeometry(modelID, placedGeometry);

        const matrix = new THREE.Matrix4();
        matrix.fromArray(placedGeometry.flatTransformation);
        geometry.applyMatrix4(matrix);

        const color = placedGeometry.color;
        const material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(color.x, color.y, color.z),
          opacity: color.w,
          transparent: color.w !== 1,
          side: THREE.DoubleSide,
          shadowSide: THREE.BackSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        elementGroup.add(mesh);
      }

      model.object.add(elementGroup);
    });
  }

  function getBufferGeometry(
    modelID: number,
    placedGeometry: any
  ): THREE.BufferGeometry {
    if (!ifcAPI.value) throw new Error("IFC API not initialized");

    const geometry = ifcAPI.value.GetGeometry(
      modelID,
      placedGeometry.geometryExpressID
    );

    const verts = ifcAPI.value.GetVertexArray(
      geometry.GetVertexData(),
      geometry.GetVertexDataSize()
    );

    const indices = ifcAPI.value.GetIndexArray(
      geometry.GetIndexData(),
      geometry.GetIndexDataSize()
    );

    const bufferGeometry = new THREE.BufferGeometry();
    const posFloats = new Float32Array(verts.length / 2);
    const normFloats = new Float32Array(verts.length / 2);

    for (let i = 0; i < verts.length; i += 6) {
      posFloats[i / 2 + 0] = verts[i + 0];
      posFloats[i / 2 + 1] = verts[i + 1];
      posFloats[i / 2 + 2] = verts[i + 2];

      normFloats[i / 2 + 0] = verts[i + 3];
      normFloats[i / 2 + 1] = verts[i + 4];
      normFloats[i / 2 + 2] = verts[i + 5];
    }

    bufferGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(posFloats, 3)
    );
    bufferGeometry.setAttribute(
      "normal",
      new THREE.BufferAttribute(normFloats, 3)
    );
    bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

    geometry.delete();
    return bufferGeometry;
  }

  function focusCameraOnModel(model: THREE.Object3D) {
    if (!camera.value || !controls.value) return;

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.value.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5;

    camera.value.position.set(
      center.x + cameraZ * 0.5,
      center.y + cameraZ * 0.5,
      center.z + cameraZ
    );
    controls.value.target.copy(center);
    camera.value.lookAt(center);
    controls.value.update();
  }

  function dispose() {
    if (renderer.value?.domElement.parentElement) {
      renderer.value.domElement.parentElement.removeEventListener(
        "click",
        handleClick
      );
      renderer.value.domElement.parentElement.removeEventListener(
        "mousemove",
        handleMouseMove
      );
      renderer.value.domElement.parentElement.removeEventListener(
        "dblclick",
        handleDoubleClick
      );
    }
    window.removeEventListener("resize", onWindowResize);

    renderer.value?.dispose();
    controls.value?.dispose();

    models.value.clear();
    scene.value = null;
    camera.value = null;
    renderer.value = null;
    controls.value = null;
    ifcAPI.value = null;
    grid.value = null;
    axes.value = null;
  }

  function toggleGrid() {
    if (grid.value) {
      grid.value.visible = !grid.value.visible;
    }
  }

  function toggleAxes() {
    if (axes.value) {
      axes.value.visible = !axes.value.visible;
    }
  }

  function toggleShadows() {
    if (renderer.value) {
      renderer.value.shadowMap.enabled = !renderer.value.shadowMap.enabled;
      scene.value?.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = renderer.value?.shadowMap.enabled;
          child.receiveShadow = renderer.value?.shadowMap.enabled;
        }
      });
    }
  }

  function updateOpacity(value: number) {
    scene.value?.traverse((child: any) => {
      if (child.isMesh && child.material && !child.isSelected) {
        child.material.opacity = value;
        child.material.transparent = value < 1;
        child.material.needsUpdate = true;
      }
    });
  }

  return {
    models,
    scene,
    camera,
    renderer,
    controls,
    ifcAPI,
    selectedObject,
    grid,
    axes,
    initViewer,
    loadIFC,
    dispose,
    toggleGrid,
    toggleAxes,
    toggleShadows,
    updateOpacity,
  };
}
