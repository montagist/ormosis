var mongodb = require('mongodb');
var ObjectID = mongodb.ObjectID;

var MongoClient = mongodb.MongoClient;

var crypto = require('crypto');
var pool = require('object-pool');

var P = require('bluebird');
var fifo = require('fifo');




//TODO: Method that turns constructor into callback/promise-maker that queries db for 
//		said items and populates their values after instantiation, as long as there is
//		a reference to the _id prop immediate  after instantiation

//TODO: Easily consumed JSON file logs on db writing errors

//TODO: config options for distinction btwn. own vs prototype properties

//TODO: Batched CRUD operations at intervals (and/or debounced?)

//TODO: Lazy loading of properties & arrays from server?

//TODO: Flush updates instead of doing all

//TODO: Some strategy for Arrays and nested objs

//TODO: Class instance factory that connects to stream from db

//TODO: Writes batched by time, number, ...

/*
	
	// module level basis?
	
	ormosisOpts = {
		
		partialUpdates: false,	// Determines whether _origVals are compared to create update doc. disableMetaVals must be False
		disableMetaOpts: true,	// No overhead of reading meta options repeatedly, all defaults
		disableMetaVals: true,	// When you don't want any overhead from hashing, etc
		trapMethodCalls: false	// (Proxied?) logic to compare hashes before & after call and update accordingly. disableMetaVals must be False
		
	};
	
	// Ormosis specfied, instance by instance basis
	
	{}._ormosis = {

		_prevValHash: "",		// Hash of key/value pairs existing on Object when first processed. Controlled by disableMetaVals
		_newValHash: "",		// New key/value pairs hash. Updated (w/ prevValHash) on every save op. Controlled by disableMetaVals
		_origVals: {...},		// Used to compare & detect changed values so only changed fields are updated. Controlled by disableMetaVals/
	}
	
	// User specified, prototypical (?) basis
	
	{}._ormosis = {
		
		mongoOpts: {			// (Optional) Specifies which MongoDB instance should be written to, in case user wants
			...					// different Objects to be written to different instances. Otherwise this will be set at
		},						// the module level at instantiation
		collection: "",			// Defaults to {}.constructor.name
		depth: 1,				// 
		ignoreBlanks: true
		customID: false,
		customIDFactory: function
	};	
	
*/

var Ormosis = function() {
	
	this.objProxies = [];
	this.updateQueue = [];	//fifo();
	this.collectionsMap = {};	// Probably don't want a bunch of Collection instances
	this.db = null;
	
	this.props2Crud = {};

	var _ref = this;
	
	MongoClient.connect( 'mongodb://localhost:27017/myproject', {}, function( err, db ) {
		
		_ref.db = db;
	} );
	
	this.objPool = pool( { init: function() { return {}; },
							enable: function( obj ) {		
								for ( var vk in obj ) {
								    if ( obj.hasOwnProperty( vk ) )
								        delete obj[vk];
								}
							},
							initSize: 100 } );	
	
	


	
	this.wrapConstructor = function( theConFunc ) {
		
		var orm = this;
		
		return function() {
			
			var args = Array.prototype.slice.call( arguments );
			
			var fincb = args[ args.length - 1 ],
				query = args[ args.length - 2 ];
				
			args = args.slice( 0, args.length - 2 );
				
			var collection = orm.db.collection( theConFunc.name );  //theConFunc._ormosis.collection );
			
			collection.find( query ).toArray( function( e, r ) {
				
				var ormClassInstances = [];
			
				for ( var i = 0; i < r.length; i++ )
					ormClassInstances.push( orm._new( theConFunc, r[ i ], args ) );
					
				fincb( e, ormClassInstances );

			} );
		}
	}
	
	this.wrapObj = function( obj, ormOpts ) {
		
		var orm = this;

		/* Instantiating new ObjectID on wrapping, even if no insertion
			which will help group writes before initial inserts
			and alleviate need to match up IDs after the CRUD op */
		if ( !orm._getIDVal( obj ) )
			obj[ orm._getIDField( obj ) ] = new ObjectID();

		var np = new Proxy( obj, orm.objModifyHandler );
		orm.objProxies.push( np );
		return np;
	}

	this._new = function( func, ormObj, conParams ) {
	
		var res = ormObj || {};
		
	    if ( func.prototype !== null )
	        res.__proto__ = func.prototype;

	    var ret = func.apply( res, conParams );

	    if ( ( typeof ret === "object" || typeof ret === "function" ) && ret !== null )
	        return ret;

		return res;
	}
	
	this._prepQueue = function() {
		
		/*
		var upQ = this.updateQueue,
			retArr = [];

		for ( var node = upQ.node; node; node = upQ.shift() )
			retArr.push( retArr.value );
			
		return retArr;
		*/
		
		return this.updateQueue;
	};
	
	
	this._getIDVal = function( obj ) {
		
		return obj[ this._getIDField( obj ) ];
	}
	
	this._getIDField = function( obj ) {
		
		return obj._ormosis.customID || "_id";
	}
	
	this._getCollection = function( obj ) {
		
		
	}
	
	this._prepObj = function( obj, _optField ) {
			
		if ( _optField )
			return this.objPool.create()[ _optField ] = obj[ _optField ];

		var newProps = Object.assign( this.objPool.create(), obj );
		delete newProps._ormosis;
		return newProps;	
	}

	this._processQueue = function( meta, fincb ) {

		var collection = this.db.collection( meta.collection )
			orm = this;
		
		collection.bulkWrite( this._prepQueue(), 
							  this.objPool.create(), 
							  function( e, r ) {

			if ( fincb ) fincb( e, r );
		} );
	}	
	

	this.objModifyHandler = {
		
		orm: this,	// instance ref. for handler methods
			
		get: function ( oTarget, sKey ) {
			
			return oTarget[sKey] || undefined;
		},
		
		set: function ( oTarget, sKey, vValue ) {
			
			var res = oTarget[ sKey ] = vValue;
			
			if ( !res || sKey == orm._getIDField( oTarget ) )
				return res;

			var newProps = this.orm._prepObj( oTarget ),
				upQ = this.orm.updateQueue,
				n = this.orm.objPool.create;
				
			var upDoc = n();
			upDoc.updateOne = n();
			upDoc.updateOne.upsert = true;
			upDoc.updateOne.filter = n();
			upDoc.updateOne.filter[ orm._getIDField( oTarget ) ] = new ObjectID( newProps[ orm._getIDField( oTarget ) ] );
			upDoc.updateOne.update = n();
			upDoc.updateOne.update[ '$set' ] = newProps;
			
			
			//upQ.push( { updateOne: { filter: {_id: new mongodb.ObjectID(newProps._id) }, update: {$set: newProps}, upsert:true } } );
			
			upQ.push( upDoc );
			
			this.orm._processQueue( oTarget._ormosis );
			
			return res;
		},
		
		deleteProperty: function ( oTarget, sKey ) {
			
			var unset = { $unset: {} };
			unset["$unset"][ sKey ] = "";
		
			this.orm.updateQueue.push( { updateOne: { filter: {_id: new mongodb.ObjectID(oTarget[ orm._getIDField( oTarget ) ]) }, update: unset } } );
			
			this.orm.processQueue( oTarget._ormosis );
			
			return delete oTarget[ sKey ];
		}
	}
}


module.exports = Ormosis;