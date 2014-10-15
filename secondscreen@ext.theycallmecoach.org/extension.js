const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const WorkspacesView = imports.ui.workspacesView;
const Overview = imports.ui.overview;
const OverviewControls = imports.ui.overviewControls;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;

const ExtensionSystem = imports.ui.extensionSystem;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SsWorkspaceThumbnails = Me.imports.ssWorkspaceThumbnails;

let ss, text, button;

//
const SecondScreen = new Lang.Class({
	Name: 'SecondScreen',
	
	_init : function() {
        this.monitors = Main.layoutManager.monitors;
        this.primaryIndex = Main.layoutManager.primaryIndex;
        this.thumbnailsBox = [];

        for (let i = 0; i < this.monitors.length; ++i) {
            //We skip the main monitor since we assume that it's handled already        	
            if (i == this.primaryIndex) {
        		continue;
        	}
 
        	this.thumbnailsBox[i] = new SsWorkspaceThumbnails.SsThumbnailsBox(i);
          //This changes the border to curve the right way when the second screen is on the right
          this.thumbnailsBox[i].actor.set_style_pseudo_class('rtl');
        	this.thumbnailsBox[i].actor.set_position(this.monitors[i].x, this.monitors[i].y);
        	Main.layoutManager.overviewGroup.add_actor(this.thumbnailsBox[i].actor);
        }
	  },
    destroy : function(){
	    for (let i in this.thumbInjection) {
	        removeInjection(WorkspaceThumbnail.ThumbnailsBox.prototype, this.thumbInjection, i);
	    }
        for (let t in this.thumbnailsBox) {
            t.destroy();
        }
    }
});


function injectToFunction(parent, name, func) {
    let origin = parent[name];
    parent[name] = function() {
        let ret;
        ret = origin.apply(this, arguments);
        if (ret === undefined) {
                ret = func.apply(this, arguments);
        }
        return ret;
    }
    return origin;
}

function removeInjection(object, injection, name) {
    if (injection[name] === undefined) {
        delete object[name];
    } else {
        object[name] = injection[name];
    }
}

function init() {
}


var injections = [];



function enable() {
  ss = new SecondScreen();
	
  injections['_updateWorkspacesActualGeometry'] = injectToFunction(WorkspacesView.WorkspacesDisplay.prototype, '_updateWorkspacesActualGeometry',
            function() {
                let [x, y] = this.actor.get_transformed_position();
                let allocation = this.actor.allocation;
                let width = allocation.x2 - allocation.x1;
                let height = allocation.y2 - allocation.y1;
                let monitors = Main.layoutManager.monitors;
                
                for (let i = 0; i < monitors.length; i++) {
                  if (this._primaryIndex == i) {
                    continue;
                  }
                  let boxWidth = ss.thumbnailsBox[i].actor.width;
                  let primaryGeometry = { x: x + monitors[i].x + boxWidth, y: y, width: width - boxWidth, height: height };
                  let geometry = primaryGeometry;
                  this._workspacesViews[i].setActualGeometry(geometry);
                }
      });   
    
}

function disable() {
    ss.destroy();

    for (i in this.injections) {
        removeInjection(WorkspacesView.WorkspacesDisplay.prototype, this.injections, i);
    }
}
