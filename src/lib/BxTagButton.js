/*
 * License: Reuse only without modifying the next two lines
 * author: Ruben@e-motiv.net
 * link: http://attic.e-motiv.net
 */

const { merge } = require('sdk/util/object');
const { Class } = require('sdk/core/heritage');
const { Disposable } = require('sdk/core/disposable');

const { id: addonID } = require('sdk/self');
const cleanSelfId=addonID.toLowerCase().replace(/[^a-z0-9_]/g, '-');

const view		= require('sdk/ui/button/view');
const utils		= require('sdk/window/utils');
const window	= utils.getMostRecentBrowserWindow();
const doc		= window.document;
const tabs		= require("sdk/tabs");

const XUL_NS	= 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

const { search }		= require("sdk/places/bookmarks");
const { getFavicon }	= require("sdk/places/favicon");

const { PlacesUIUtils } = require("resource:///modules/PlacesUIUtils.jsm"); 
const { PlacesUtils } = require("resource://gre/modules/PlacesUtils.jsm");
const bmSvc		= PlacesUtils.bookmarks;

const { CustomizableUI } = require("resource:///modules/CustomizableUI.jsm");

var {Cu} = require("chrome");
Cu.import("resource://gre/modules/Task.jsm");  //For Task for bookmark properties

const sort = new Array (
		{sort:'title',			descending:false},
		{sort:'title',			descending:true},
		{sort:'date',			descending:false},
		{sort:'date',			descending:true},
		{sort:'visitCount',		descending:false},
		{sort:'visitCount',		descending:true},
		{sort:'dateAdded',		descending:false},
		{sort:'dateAdded',		descending:true},
		{sort:'lastModified',	descending:false},
		{sort:'lastModified',	descending:true},
		{sort:'url',			descending:false},
		{sort:'url',			descending:true}
	);
const normalIcon = {
    "16": "./tag16.png",
    "32": "./tag32.png",
    "48": "./tag48.png"
};
const waitIcon = {
	      "16": "chrome://global/skin/icons/loading_16.png"
};
const needsUpdateIcon = {
	    "16": "./tagflarered16.png",
	    "32": "./tagflarered32.png",
	    "48": "./tagflarered48.png"
};
const updatedIcon = {
	    "16": "./tagflare16.png",
	    "32": "./tagflare32.png",
	    "48": "./tagflare48.png"
};

//Clean Up
require("sdk/system/unload").when(function() {
    // Context Menu
	MIContext.remove();
	ButContext.remove();
});


/*
 *  Menu items CONTEXT-MENU
 */

let	MIContext = doc.createElementNS(XUL_NS,'menupopup');
let MICtId=cleanSelfId + '-menuitems-context';
MIContext.setAttribute("id",MICtId);
doc.getElementById("mainPopupSet").appendChild(MIContext);

//Create ContextMenu items
[
 ["Open", 					bmOpen,		"o"	],
 ["Open in a New Tab",		bmOpenTab,	"w"	],
 ["Open in a New Window",	bmOpenWin,	"n"	],
 [],
 ["New Bookmark", 			bmNew,		"b"	],
 [],
 ["Delete Bookmark", 		bmDel,		"d"],
 [],
 ["Bookmark Properties", 	bmEdit,		"i"	],
]
.forEach(function(miDef){
	if(miDef.length==0) {
		var mi = doc.createElementNS(XUL_NS,'menuseparator');
	} else {
		var mi = doc.createElementNS(XUL_NS,'menuitem');
//		mi.setAttribute		('id',			MICtId+"-"+miDef[0]	);
		mi.setAttribute		('label',		miDef[0]			);
//		mi.setAttribute		('class',		"menuitem-iconic"	);
		mi.doThis			=				miDef[1];
		mi.addEventListener	('command',		doIContextDummy		);
		mi.setAttribute		('accesskey',	miDef[2]			);
	}
	MIContext.appendChild(mi);
});


function doIContextDummy(e) {				//	console.log("doIContextDummy", e.target.doThis.name, e.target.parentNode.triggerNode);
	e.target.doThis.call(this,e.target.parentNode.triggerNode); 
}

//General bookmark functions (can't reuse, see reusing bookmarks trials)
function bmOpen(bmItem) {						//	console.log(u);
	tabs.activeTab.url=bmItem.value;
};
function bmOpenTab(bmItem) {
	tabs.open({
		  url: bmItem.value,
		  inBackground: true
		});
}
function bmOpenWin(bmItem) {
	tabs.open({
	  url: bmItem.value,
	  inNewWindow: true
	});
}
function bmNew(bmItem) {							//console.log("bmNew");
	PlacesUIUtils.showBookmarkDialog({
		action:	"add",
		type:	"bookmark",
		title:	"NAAMTEST"						//tags:	bmItem.parentNode.bmTags 
	}, window);
}

function bmEdit(bmItem) {						//console.log("bmEdit", bmItem.bmId);
	Task.spawn(function* () {
	    let node = yield PlacesUIUtils.fetchNodeLike({ url: bmItem.value });
	    if (!node)
	        return;
		PlacesUIUtils.showBookmarkDialog({	action: "edit", 
		                                  		node
		                                   }, window.top);
		return;
	}).catch(Cu.reportError);
}

function bmDel(bmItem) {					// console.log("bmEdit");	console.log(bmItem);
	if (window.confirm("Do you really want to delete this bookmark?\n\n"+bmItem.label+"\n-----\n"+bmItem.value, "Delete Bookmark")) {
		bmSvc.removeItem(bmItem.bmId);
	}
}

//Ze Button!!
const BxTagButton = Class({
	 implements: [
	              Disposable
	            ],
	setup: function setup(options) {		//console.log("BxTagButton initialize",options);
        this.id=options.id=cleanSelfId + '-TagButton-' + options.id;	
        
    	//set tagOptions
    	this.tags		= options.tags;
    	this.order		= options.order;
    	this.itemMap	= new Map();
    	this.isupdated	= true;

    	let BxB=this; 						//for use in popupevent
    	
    	
    	// Make button element
    	let gOptions = merge (options, {	//if using image instead of icon, something breaks and no id
			type: 'menu',					// menu-button for button ánd dropdown
			icon: waitIcon
    	});
    	
    	view.create(gOptions);
    	this.node = view.nodeFor(gOptions.id);
    	this.node.setAttribute('class', 'bookmark-item');
    	this.node.setAttribute('constrain-size', "false"); 
    	this.node.bxTbutton = this;
    	this.node.setAttribute('context', ButCtId);

    	this.node.addEventListener('popupshown', function(e) {		//console.log(e, e.currentTarget);
    		if (BxB.isUpdated) BxB.statusNormal();
    	});
		
		// Make and attach menupopup
		this.pp = doc.createElementNS(XUL_NS,'menupopup');
		this.pp.setAttribute("placespopup", "true");
		this.pp.setAttribute('id', this.node.id + '-MenuPopup');
		//If this below could work once, it would be fantastic! However: this._view is null...
		//this.pp.setAttribute("context", "placesContext");
		this.pp.setAttribute("context", MICtId);
		
		this.node.appendChild(this.pp);
		
		this.getBms();
		
    },
    
    getBms: function() {								//console.log("getBms start",this.tags, this.order);
		let BxB = this;
		view.setIcon(BxB.id, window, waitIcon);
    	//Bookmarks search for tags and sort by
		search(	  [{ tags: this.tags }],  sort[this.order]		)
			.on("end", function(results) {				//console.log("Search result", results)
				
				results.forEach(function(bm){			
					BxB.addmenuitem(bm.id, bm.title, bm.url);	
				});
				BxB.statusNormal();									//console.log("getBms SEARCH end");
			})
			.on("error", function(reason) {
				console.error("get Bookmarks error", reason);
			});
    },
	
	addmenuitem: function(bmId, label, url) {			//console.log("addmenuitem", bmId, label.substr(0,15));
		
		if (label==undefined) label='Empty titel';
		
		var mi = doc.createElementNS(XUL_NS,'menuitem');
		this.itemMap.set(bmId, mi);
		var icon = getFavicon(url)
			.then(function(ic){					//icon is promise
			    mi.setAttribute('image',	ic);
			}, function(reason) {
			    //do nothing, just no icon, but have to catch for not getting error
			});
		mi.bmId=bmId;
		mi.setAttribute('id',			this.node.id + '-Item-' + this.pp.childElementCount);
		mi.setAttribute('class',		'menuitem-iconic bookmark-item menuitem-with-favicon');
		mi.setAttribute('scheme',		PlacesUIUtils.guessUrlSchemeForUI(url));
		mi.setAttribute('type',			0);			//mi.type=0;
		mi.setAttribute('label',		label);
		mi.setAttribute('value',		url);
		//following possibly for (open) functions in the future reusing bookmark contextmenu
		mi.setAttribute('uri', 			url );		
		
		mi.addEventListener('command', function(e) {			//console.log(this);console.log(e);
			if (e.ctrlKey) 
				bmOpenTab(this);
			else if (e.shiftKey) 
				bmOpenWin(this);
			else if (e.altKey) 
				bmEdit(this);
			else 
				bmOpen(this);
		}, false);
		
		
		this.pp.appendChild(mi);
	},
	
	removemenuitem: function(bmId) {							console.log("removemenuitem", bmId);
		var mi=this.itemMap.get(bmId);							console.log(this.itemMap, mi);
		if	(mi !== undefined) {
			mi.remove();
			this.itemMap.delete(bmId);
			this.statusUpdated();
		}
	},
	
	removemenuitems: function() {					//console.log("Removing items",this.tags);
		while (this.pp.firstChild) {
			this.pp.removeChild(this.pp.firstChild);
		}
		this.itemMap.clear();
	},
	
	statusUpdated: function() {
		this.isUpdated = true;
		view.setIcon(this.id, window, updatedIcon);
	},
	
	statusNormal: function() {
		this.isUpdated = false;
		view.setIcon(this.id, window, normalIcon);
	},
	
	needsUpdate: function() {
		view.setIcon(this.id, window, needsUpdateIcon);
	},
    
    rebuild:function(){									//console.log("Rebuild");
		this.removemenuitems();
		this.getBms();
    },
	
	dispose: function () {
		// buttons.delete(id);
		// off(this);
		this.removemenuitems();
		view.dispose(this.id);
		// unregister(this);
	}

});
exports.BxTagButton = BxTagButton;


/*
 *  Buttons CONTEXT-MENU
*/

let	ButContext = doc.createElementNS(XUL_NS,'menupopup');
let ButCtId=cleanSelfId + '-Button-context';
ButContext.setAttribute("id",ButCtId);
doc.getElementById("mainPopupSet").appendChild(ButContext);

//Create ContextMenu items
[
["Move left", 		btLeft,		"l"	],
["Move Right",		btRight,	"r"	],
 [],
// ["Rename", 		btRename,	"n"	],
 ["Rebuild", 		BxTagButton.prototype.rebuild,	"b"	],
// ["Delete", 		btDel,		"d"]
].forEach(function(miDef){
	if(miDef.length==0) {
		var mi = doc.createElementNS(XUL_NS,'menuseparator');
	} else {
		var mi = doc.createElementNS(XUL_NS,'menuitem');
//		mi.setAttribute		('id',			MICtId+"-"+miDef[0]	);
		mi.setAttribute		('label',		miDef[0]			);
//		mi.setAttribute		('class',		"menuitem-iconic"	);	//for icons to the left
		mi.doThis			=				miDef[1];
		mi.addEventListener	('command',		doBContextDummy		);
		mi.setAttribute		('accesskey',	miDef[2]			);
	}
	ButContext.appendChild(mi);
});

function doBContextDummy(e) {						//console.log("doBContextDummy",e, e.target.parentNode.triggerNode);
	e.target.doThis.call(e.target.parentNode.triggerNode.bxTbutton);
	//e.target.parentNode.triggerNode(e.target.doThis);
}

function btLeft() {					//	console.log(u);
	var { position } = CustomizableUI.getPlacementOfWidget(this.id);
	CustomizableUI.moveWidgetWithinArea(this.id, position-1);
	//TODO: update position in perfs
};
function btRight() {
	var { position } = CustomizableUI.getPlacementOfWidget(this.id);
	CustomizableUI.moveWidgetWithinArea(this.id, position+2);
}
/*
function btDel() {	// console.log("bmEdit");	
	if (window.confirm("Do you really want to delete this x Tag Button?\n\n"+but.label+"\n-----\n", "Delete x Tag Button")) {
		//removeItem(bmItem.bmId);
		//update prefs;
	}
}*/