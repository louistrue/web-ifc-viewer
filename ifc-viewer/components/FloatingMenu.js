import { Connections } from "./Connections.js";

export class FloatingMenu {
  constructor(viewer) {
    this.viewer = viewer;
    this.connections = new Connections(viewer);
    this.setupFloatingMenu();
  }

  setupFloatingMenu() {
    // Create floating menu
    const menu = document.createElement("div");
    menu.className = "floating-menu";
    menu.innerHTML = `
      <button class="menu-btn" title="Hide/Show Selected (Space)">
        <i class="fas fa-eye"></i>
      </button>
      <button class="menu-btn" title="Isolate Selected">
        <i class="fas fa-expand"></i>
      </button>
      <button class="menu-btn" title="Show All">
        <i class="fas fa-border-all"></i>
      </button>
      <button class="menu-btn" title="Analyze Connections">
        <i class="fas fa-project-diagram"></i>
      </button>
    `;

    // Add event listeners
    const [hideBtn, isolateBtn, showAllBtn, connectionsBtn] =
      menu.querySelectorAll(".menu-btn");

    hideBtn.addEventListener("click", () =>
      this.viewer.toggleSelectedVisibility()
    );
    isolateBtn.addEventListener("click", () => this.viewer.isolateSelected());
    showAllBtn.addEventListener("click", () => this.viewer.showAll());
    connectionsBtn.addEventListener("click", () => {
      // Toggle connections section visibility
      const connectionsSection = document.querySelector(".connections-section");
      if (connectionsSection) {
        const isHidden = connectionsSection.classList.toggle("hidden");
        if (!isHidden) {
          this.connections.analyzeConnections();
        } else {
          this.connections.exitConnectionMode();
        }
      }
    });

    document.body.appendChild(menu);

    // Create connections section in the left panel
    const modelsContent = document.querySelector(".models-content");
    if (modelsContent) {
      const connectionsSection = document.createElement("div");
      connectionsSection.className = "connections-section hidden";
      connectionsSection.innerHTML = `
        <div class="section-header">
          <h3>Connections</h3>
        </div>
        <div class="connection-filters">
          <div class="filter-group">
            <label>Visibility Controls</label>
            <div class="visibility-controls">
              <label><input type="checkbox" class="type-toggle" data-type="point" checked> Point</label>
              <label><input type="checkbox" class="type-toggle" data-type="line" checked> Line</label>
              <label><input type="checkbox" class="type-toggle" data-type="surface" checked> Surface</label>
            </div>
            <div class="label-control">
              <label><input type="checkbox" id="show-labels"> Show All Labels</label>
            </div>
          </div>
        </div>
        <div class="connections-list"></div>
      `;

      modelsContent.appendChild(connectionsSection);

      // Add event listeners for visibility controls
      const typeToggles = connectionsSection.querySelectorAll(".type-toggle");
      typeToggles.forEach((toggle) => {
        toggle.addEventListener("change", (e) => {
          const type = e.target.dataset.type;
          if (this.connections.connectionVisualizer) {
            this.connections.connectionVisualizer.setTypeVisibility(
              type,
              e.target.checked
            );
          }
        });
      });

      // Add event listener for label visibility
      const labelToggle = connectionsSection.querySelector("#show-labels");
      labelToggle.addEventListener("change", (e) => {
        if (this.connections.connectionVisualizer) {
          this.connections.connectionVisualizer.setGlobalLabelVisibility(
            e.target.checked
          );
        }
      });
    }
  }
}
