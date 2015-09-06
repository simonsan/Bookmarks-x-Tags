/*  XTAGS BUTTONS 
 *
 * License: Reuse only without modifying the next two lines
 * author: Ruben, e-motiv.net
 * link: http://attic.e-motiv.net
 */

const { BxTagButton }		= require('./lib/BxTagButton');

const { PlacesUtils }		= require("resource://gre/modules/PlacesUtils.jsm");	
//This removes the need to import Ci and the XPCOMUtils
const { Class }				= require("sdk/core/heritage");
const { Unknown }			= require('sdk/platform/xpcom');

const { CustomizableUI }	= require("resource:///modules/CustomizableUI.jsm");

// A map to be able to destroy all our buttons
// TODO: Should be done in module and just keep array with ids here, or no array and have a destroyAll function in module too
let buttons = new Map(); // WeakMap not working right ad hoc

//Clean Up
exports.onUnload = function() {    //console.log("Addon unloading");	
	// Context Menu
	ButContext.remove();
    destroyTagButs();
}

function destroyTagButs() {
	if (buttons.size) {
		for (let [b,] of buttons) {
			b.dispose();
			buttons.delete(b);
		}	
	}	
}
function rebuildTagButs(config) {	//console.log("Destroying and rebuilding xTags - START");	//console.log(config);
	
	if (!Array.isArray(config)) return false;

	var butPosArr = new Array();
	
	config.forEach(function(tagOpt, i){		//console.log(i, tagOpt.label);
				
				var but = BxTagButton({
					id: 	i,
					label:	tagOpt.label,
					tags:	tagOpt.tags,
					order:	tagOpt.order
				});
				// Add to our map
				buttons.set(but,i);
				//To order later
				butPosArr[i]=CustomizableUI.getPlacementOfWidget(but.id).position;
		
	});
	//Sorting
	butPosArr.sort(sortInt);
	buttons.forEach(function(i, but){		//console.log(i, but.node.label, typeof butPosArr[i]);
		CustomizableUI.moveWidgetWithinArea(but.id, butPosArr[i]);
	});
// console.log("Destroying and Rebuilding xTags - STOP");
}
//javascript needs this to sort numerically
function sortInt(a,b) {
    return a - b;
}



/* GET & SET PREFERENCES */
// Note:Preferences changed listener shouldn't be needed since we allow only by
// our own button and we could also get loop
const myPref = require("sdk/simple-prefs");
let xTagsPref;

var notifications = require("sdk/notifications");
try {
	xTagsPref = JSON.parse(myPref.prefs.xTags);
} catch (e) {
	console.error("xTag preference is corrupt.");
	// Doesn't work yet for some reason
	notifications.notify({
	  title: "xTag preference corrupt",
	  text: "xTag preference is corrupt.",
	  data: "xTag preference is corrupt. (Check in your about:config and reset it, but be carefull and you will lose all xTag definitions.)",
	  iconURL: "./tag48.png"
	});
}

// CONFIGURATION BUTTON
var setBut = require("sdk/ui/button/action").ActionButton({
	id: "settingsButton",
	label: "BTag X",
	icon: {
	  "16": "./tag-lines16.png",
	  "32": "./tag-lines32.png",
	  "48": "./tag-lines48.png"
	},
	onClick: showPanel
});
//CONFIGURATION BUTTON CONTEXT-MENU

const { getNodeView }	= require("sdk/view/core");
let setButNode 			= getNodeView(setBut);
let doc					= setButNode.ownerDocument;
const XUL_NS			= 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const { id: addonID }	= require('sdk/self');
const cleanSelfId=addonID.toLowerCase().replace(/[^a-z0-9_]/g, '-');


let	ButContext = doc.createElementNS(XUL_NS,'menupopup');
let ButCtId= cleanSelfId + '-settingsButton-context';
ButContext.setAttribute("id",ButCtId);
doc.getElementById("mainPopupSet").appendChild(ButContext);


/* CREATE MAIN BUTTON CONTEXT-MENU */
[
["Follow me, x Tag Buttons!",	btFollow,	"f"	],
[],
["Test",				btTest,	"t"	],
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

//Here is the context magic
setButNode.setAttribute('context', ButCtId);

function doBContextDummy(e) {		//	console.log(e);
	e.target.doThis.call(e.target.parentNode.triggerNode);
}

function btFollow() {
	var myArea = CustomizableUI.getPlacementOfWidget(setButNode.id).area; 				//console.log(myArea);
	buttons.forEach(function(i, but){		//console.log(i, but.node.label);
		CustomizableUI.addWidgetToArea(but.id, myArea);
	});
};

function btTest() { 				//console.log("This is a test");
	notifications.notify({
		  title: "This is a test",
		  text: "It really is!",
		  iconURL: "./tag48.png"
		});
}



function showPanel(state) {
	xtagSetPanel.show();
}

rebuildTagButs(xTagsPref);


/* CREATE CONFIGURATION BUTTON WITH PANEL */
var xtagSetPanel = require("sdk/panel").Panel({
	width: 640,
	height: 400,
	contentURL: "./xTag-Set-Panel.html"
});


function savePrefs(prefs) {
	myPref.prefs.xTags=JSON.stringify(prefs);
}

// Hide panel when ready save settings when necessary
xtagSetPanel.port.on("hide", function (prefs) {
	xtagSetPanel.hide();
	if (prefs) {
		savePrefs(prefs);
		xTagsPref = prefs; // For updating when bookmarks changed
		destroyTagButs();
		rebuildTagButs(prefs);
	}
});

// Pass existing preferences to contentscript
xtagSetPanel.port.emit("pref-start", xTagsPref);


//Check "Backup and trials" for a start at a better listener on a wrong time
let bmListener = Class({
	extends: Unknown,
	interfaces: [ "nsINavBookmarkObserver" ],
	//This event one will take care of all others since the latter are buggy or inconsistent logic
	onItemChanged:	function(bId, prop, an, nV, lM, type, parentId, aGUID, aParentGUID) {
		console.log("onItemChanged", "bId: "+bId, "property: "+prop, "isAnno: "+an, "new value: "+nV, "lastMod: "+lM, "type: "+type, "parentId:"+parentId, "aGUID:"+aGUID);
		skipTagCheck=false;
		
		//itemRemoved. onItemRemoved doesn't work logically enough
		if (prop == "") {		
			for (let [b,] of buttons) {
				b.removemenuitem(bId);
				skipTagCheck=true;
			} 
		}
		
		//change of existing menu item
		else for (var [b,] of buttons) {
			if (b.itemMap.get(bId) !== undefined) {
				b.needsUpdate();
			}
		} 
		
		//If possible tags added to bookmark not in one or any button
		if (!skipTagCheck  && prop=="tags") {
			checkNewTags(bId);
		}
	}
});
var bmlistener = bmListener();
PlacesUtils.bookmarks.addObserver(bmlistener, false);



function checkNewTags(bId) {						//console.log("Checking new tags");
	let changedURI = PlacesUtils.bookmarks.getBookmarkURI(bId);
	let newtags = PlacesUtils.tagging.getTagsForURI(changedURI);

	if (newtags.length) {
		for (let [b,] of buttons) {					//console.log(b.tags);
			if	(b.tags.every(function (v) { //If all necessary tags	
					if (newtags.indexOf(v) >= 0)	return true;
					})
				) {
				//console.log("Relevant Bm added. Refreshing x Tag.", bId);
				b.needsUpdate();
			}
		}            	
	}
}
