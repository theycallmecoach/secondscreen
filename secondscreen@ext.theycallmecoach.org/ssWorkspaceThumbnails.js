const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;
const GObject = imports.gi.GObject;

const Background = imports.ui.background;
const DND = imports.ui.dnd;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const WindowManager = imports.ui.windowManager;
const Workspace = imports.ui.workspace;
const WorkspacesView = imports.ui.workspacesView;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const OverviewControls = imports.ui.overviewControls;

/**
 * @metaWorkspace: a #Meta.Workspace
 */

// Subclass WorkspaceThumbnail from gnome-shell and override
// each method that assumed it will only display on the
// primary monitor.
//
//
const SsWorkspaceThumbnail = new Lang.Class({
    Name: 'SsWorkspaceThumbnail',
    Extends: WorkspaceThumbnail.WorkspaceThumbnail,

//    _init : function(metaWorkspace) {
    _init : function(metaWorkspace,monitorIndex) {
 	      global.log("###INIT SsWorkspaceThumbnail###");	
        this.metaWorkspace = metaWorkspace;
        //this.monitorIndex = Main.layoutManager.primaryIndex;
        this.monitorIndex = monitorIndex;

        this._removed = false;

        this.actor = new St.Widget({ clip_to_allocation: true,
                                     style_class: 'workspace-thumbnail' });
        this.actor._delegate = this;

        this._contents = new Clutter.Actor();
        this.actor.add_child(this._contents);

        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        this._createBackground();

//        let monitor = Main.layoutManager.primaryMonitor;
        let monitor = Main.layoutManager.monitors[monitorIndex];
        this.setPorthole(monitor.x, monitor.y, monitor.width, monitor.height);

        let windows = global.get_window_actors().filter(Lang.bind(this, function(actor) {
            let win = actor.meta_window;
            return win.located_on_workspace(metaWorkspace);
        }));

        // Create clones for windows that should be visible in the Overview
        this._windows = [];
        this._allWindows = [];
        this._minimizedChangedIds = [];
        for (var i = 0; i < windows.length; i++) {
            let minimizedChangedId =
                windows[i].meta_window.connect('notify::minimized',
                                               Lang.bind(this,
                                                         this._updateMinimized));
            this._allWindows.push(windows[i].meta_window);
            this._minimizedChangedIds.push(minimizedChangedId);

            if (this._isMyWindow(windows[i]) && this._isOverviewWindow(windows[i])) {
 	              global.log("ssworkspace::ADDING CLONE:" +windows[i]);	
                
                this._addWindowClone(windows[i]);
            }
        }

        // Track window changes
        this._windowAddedId = this.metaWorkspace.connect('window-added',
                                                          Lang.bind(this, this._windowAdded));
        this._windowRemovedId = this.metaWorkspace.connect('window-removed',
                                                           Lang.bind(this, this._windowRemoved));
        this._windowEnteredMonitorId = global.screen.connect('window-entered-monitor',
                                                           Lang.bind(this, this._windowEnteredMonitor));
        this._windowLeftMonitorId = global.screen.connect('window-left-monitor',
                                                           Lang.bind(this, this._windowLeftMonitor));

        this.state = WorkspaceThumbnail.ThumbnailState.NORMAL;
        this._slidePosition = 0; // Fully slid in
        this._collapseFraction = 0; // Not collapsed
    },

    _createBackground: function() {
//        this._bgManager = new Background.BackgroundManager({ monitorIndex: Main.layoutManager.primaryIndex,
        this._bgManager = new Background.BackgroundManager({ monitorIndex: this.monitorIndex,
                                                             container: this._contents,
                                                             vignette: false });
    },
});


// Subclass ThumbnailsBox from gnome-shell and override
// each method that assumed it will only display on the
// primary monitor.
//
//
const SsThumbnailsBox = new Lang.Class({
    Name: 'SsThumbnailsBox',
    Extends: WorkspaceThumbnail.ThumbnailsBox,

    _init: function(monitorIndex) {
      this.parent();
      this.monitorIndex = monitorIndex;
      let monitors = Main.layoutManager.monitors;
    },

    show: function() {
        this._switchWorkspaceNotifyId =
        global.window_manager.connect('switch-workspace',
                                       Lang.bind(this, this._activeWorkspaceChanged));      
        this._targetScale = 0;
        this._scale = 0;
        this._pendingScaleUpdate = false;
        this._stateUpdateQueued = false;

        this._stateCounts = {};
        for (let key in ThumbnailState)
            this._stateCounts[WorkspaceThumbnail.ThumbnailState[key]] = 0;

        // The "porthole" is the portion of the screen that we show in the workspaces
        let panelHeight = Main.panel.actor.height;
    	  let monitor = Main.layoutManager.monitors[this.monitorIndex];
        
        //let monitor = Main.layoutManager.monitors[0];
    	  this._porthole = {
            x: monitor.x,
            y: monitor.y + panelHeight,
            width: monitor.width,
            height: monitor.height - panelHeight
        };
        this.addThumbnails(0, global.screen.n_workspaces);
    },


    _ensurePorthole: function() {
        if (!this._porthole) {
//            this._porthole = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
            this._porthole = Main.layoutManager.getWorkAreaForMonitor(this.monitorIndex);
        }
    },

     addThumbnails: function(start, count) {
        this._ensurePorthole();
        for (var k = start; k < start + count; k++) {
            let metaWorkspace = global.screen.get_workspace_by_index(k);
//            let thumbnail = new WorkspaceThumbnail(metaWorkspace);
            let thumbnail = new SsWorkspaceThumbnail(metaWorkspace, this.monitorIndex);
            thumbnail.setPorthole(this._porthole.x, this._porthole.y,
                                  this._porthole.width, this._porthole.height);
            this._thumbnails.push(thumbnail);
            this.actor.add_actor(thumbnail.actor);

            if (start > 0 && this._spliceIndex == -1) {
                // not the initial fill, and not splicing via DND
                thumbnail.state = WorkspaceThumbnail.ThumbnailState.NEW;
                thumbnail.slidePosition = 1; // start slid out
                this._haveNewThumbnails = true;
            } else {
                thumbnail.state = WorkspaceThumbnail.ThumbnailState.NORMAL;
            }

            this._stateCounts[thumbnail.state]++;
        }

        this._queueUpdateStates();

        // The thumbnails indicator actually needs to be on top of the thumbnails
        this._indicator.raise_top();

        // Clear the splice index, we got the message
        this._spliceIndex = -1;
    },
});


