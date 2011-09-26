/**
 * Google+ Hangout API State Machine
 * 
 * @class kungfuters.StateMachinePlus
 * @classDescription
 * An experimental state machine for the Google+ Hangout API. This project aims to provide a 
 * solution for the lack of a "controller" script in the Google+ Hangout API. In other words,
 * since every client is running a local copy of a Hangout app, and any shared state update
 * is broadcast to all other clients, it is helpful to have a state machine that tracks both 
 * local and shared state in order to prevent duplicate method execution. 
 * @author Matt Senter of Kungfuters, LLC; http://kungfuters.com; http://zipl.us/matt
 * @version 1.0
 */
/** @namespace */
var kungfuters = {
	/**
	 * @constructor
	 * @param props Custom property overrides.
	 */
	StateMachinePlus: function(props) {
		/**
		 * The current phase of the client.
		 * @type string
		 */
		this.localPhase = this.INITIAL_PHASE;
		/**
		 * Scope for your app 
		 * @type object  
		 */
		this.scope = window;
		/**
		 * Prefix used with methods that represent phases
		 * @type string 
		 */
		this.phaseMethodPrefix = "_phase_";
		/**
		 * Collection of valid phase transitions
		 * @type Object.<string, Array.<string>>  
		 */
		this.transitions = {};
		/**
		 * Shared state key indicating phase.
		 */
		this.phaseKey = "phase";
		/* Override default props if custom props provided */
		if (props) {
			for (var key in props) {
				this[key] = props[key];
			}
		}
		/**
		 * Prevents duplicate setup calls
		 * @private
		 * @type boolean
		 */
		this._setupComplete = false;
		/* Wait for the API to load before proceeding */
		gapi.hangout.addApiReadyListener(kungfuters.bind(this, this.onApiReady));
	},
	/**
	 * Utility method for calling scoped functions. Similar to <code>$.proxy()</code> or <code>dojo.hitch()</code>.
	 * @param {Object} scope The object to be represented by the <code>this</code> keyword.
	 * @param {Function} fn The function to call.
	 * @returns {Function} The scoped function.
	 */
	bind: function(scope, fn) {
		return function() {
			fn.apply(scope, arguments);
		};
	}
};
/**
 * Default phase before starting the state machine.
 * @constant
 * @static
 * @type string 
 */
kungfuters.StateMachinePlus.prototype.INITIAL_PHASE = "ksmp_initial_phase";
/**
 * Hook for user setup, such as creating transitions or manipulating DOM.
 * This is fired after the Hangout API is ready.
 * @example
 * new kungfuters.StateMachinePlus({
 * 		setup: function() {
 * 			this.addTransition("fromPhase", "toPhase");
 * 			...
 * 		}
 * });
 */
kungfuters.StateMachinePlus.prototype.setup = function() {
	/* Must be defined via constructor. */
};
/**
 * Adds a valid transition.
 * @param {string} from The phase we can transition from
 * @param {string} to The phase we can transition to
 */
kungfuters.StateMachinePlus.prototype.addTransition = function(from, to) {
	var list = this.transitions[from];
	if (typeof list == "undefined") {
		list = [];
	}
	list.push(to);
	this.transitions[from] = list;
	if (from != this.INITIAL_PHASE) {
		this.addTransition(this.INITIAL_PHASE, from);
	}
};
/**
 * Callback for when the Hangout API has been fully loaded.
 */
kungfuters.StateMachinePlus.prototype.onApiReady = function() {
	if (!this._setupComplete) {
		this._setupComplete = true;
		gapi.hangout.data.addStateChangeListener(kungfuters.bind(this, this.onStateChange));
		this.setup();
	}
};
/**
 * Starts the state machine. This must be called from your app when you are ready
 * to start tracking state. If this is called from a client that is joining the app
 * after we have already started tracking state (for example: a game is in progress,) 
 * this will "fast-forward" the newcomer to the current shared state.
 * @param {string} firstPhase The phase in which to begin. 
 */
kungfuters.StateMachinePlus.prototype.begin = function(firstPhase) {
	if (typeof firstPhase == "undefined") {
		throw "Must pass a firstPhase to StateMachinePlus.begin(firstPhase)";
	}
	var state = gapi.hangout.data.getState();
	var inProgress = state.phase && this.INITIAL_PHASE != state.phase;
	if (inProgress) {
		this._nextLocalPhase(state, true);
	} else {
		this.nextPhase(firstPhase);
	}
},
/**
 * Advances the state machine to the next phase for all participants. If the <code>adds</code>
 * or <code>removes</code> parameters are provided, they will be passed along to update the
 * shared state as well.
 * @param {string} phase The next phase
 * @param {Object.<string, string>} adds A map of values to add to the shared state
 * @param {Array.<string>} removes A list of keys to remove from the shared state
 */
kungfuters.StateMachinePlus.prototype.nextPhase = function(phase, adds, removes) {
	if (typeof adds == "undefined") {
		adds = {};
	}
	if (typeof removes == "undefined") {
		removes =[];
	}
	adds.phase = phase;
	gapi.hangout.data.submitDelta(adds, removes);
};
/**
 * Advances the client to the next local phase. This could be in response to a shared state
 * update or a "fast-forward" call for newcomers.
 * @param {Object.<string, string>} state The shared state object 
 * @param {boolean} isInitialPhase Whether or not we've started the state machine
 */
kungfuters.StateMachinePlus.prototype._nextLocalPhase = function(state, isInitialPhase) {
	this.localPhase = state.phase;
	var methodName = this.phaseMethodPrefix + state.phase;
	var method = this.scope[methodName];
	if (!method) {
		throw "Undefined phase function: " + methodName;
	}
	method.call(this.scope, state, isInitialPhase);
};
/**
 * Hangout API listener that handles shared state changes. For the purposes of the state machine,
 * we are really only concerned with the "phase" attribute of the shared state and thus only
 * process those changes.
 * @param {Object.<string, string>} adds A map of values to add to the shared state
 * @param {Array.<string>} removes A list of keys to remove from the shared state
 * @param {Object.<string, string>} state The shared state object
 * @param {Object.<string, Object.<string,*>>} metaData The shared state metadata object
 */
kungfuters.StateMachinePlus.prototype.onStateChange = function(adds, removes, state, metaData) {
	for (var i = 0; i < adds.length; i++) {
		var key = adds[i].key;
		if (key == this.phaseKey) {
			if (typeof state.phase == "undefined" || !state.phase || state.phase == "") {
				state.phase = this.INITIAL_PHASE;
			}
			if (this._validateTransition(this.localPhase, state.phase)) {
				var isInitialPhase = this.localPhase == this.INITIAL_PHASE;
				this._nextLocalPhase(state, isInitialPhase);
			}
			break;
		}
	}
};
/**
 * Validates the proposed transition. This is very important because when multiple clients might be racing
 * to update the shared state's "phase" attribute, we must make sure any latency is accounted for by validating
 * all transitions. In other words, it is possible that the phase will be updated multiple times from multiple
 * sources for the SINGLE SAME desired transition, so the best we can do for now is make sure that the most 
 * recent update to the "phase" is actually a valid one. If not, we just ignore it.
 * @param {string} from Previous phase
 * @param {string} to Next phase
 * @returns {Boolean} Transition is valid
 */
kungfuters.StateMachinePlus.prototype._validateTransition = function(from, to) {
	var valid = false;
	var validTransitions = this.transitions[from];
	for (var i = 0; !valid && i < validTransitions.length; i++) {
		valid = validTransitions[i] == to;
	}
	return valid;
};
