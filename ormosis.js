var mongodb = require('mongodb');

var MongoClient = mongodb.MongoClient;

var crypto = require('crypto');
var utilFuncs = require('./utilFuncs');

//TODO: Method that turns constructor into callback/promise-maker that queries db for 
//		said items and populates their values after instantiation, as long as there is
//		a reference to the _id prop immediate  after instantiation

//TODO: Easily consumed JSON file logs on errors
//TODO: Methods for listing object properties ( own vs prototypes )
//TODO: Methods for updating arrays that only describe first object
//TODO: Method/util for wrapping in Proxys and holding their references
//TODO: Batched CRUD operations at intervals
//TODO: Lazy loading of properties & arrays from server?


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
		ignoreBlanks: true		// 
	};	
	
*/

var Ormosis = function() {
	
	this.crudNerve = null;
	this.objProxies = [];
	this.updateQueue = [];
	this.updateQObjMirr = [];
	this.collectionsMap = {};	// Probably don't want a bunch of Collection instances
	this.db = 
	
	this.props2Crud = {};
	this.upDoc = {};
	
	
	var ref = this;
	
	MongoClient.connect( 'mongodb://localhost:27017/myproject', {}, function( err, db ) {
		
		ref.db = db;
	} );
	
	this.clearObj = function( dedObj ) {
		
		for ( var varKey in dedObj ) {
			
		    if ( dedObj.hasOwnProperty( varKey ) )
		        delete dedObj[varKey];
		}
	}
	
	this.save = function( obj, db, fincb ) {
		
		var meta = obj._ormosis;

		//TODO: Provide means of running on all defaults despite missing meta _ormosis property
		if ( !meta )
			return;

		if ( !meta.collection )
			meta.collection = obj.constructor.name;
			
		var collection = db.collection( meta.collection )

		// Attempting to use only one obj to avoid allocating many
		var newProps = this.props2Crud;
		this.clearObj( newProps );

		// Using separate obj ref to delete _ormosis
		newProps = Object.assign( newProps, obj );	//TODO: diff. copy mechanism, won't follow prototype chain
		delete newProps._ormosis;
		
		collection.insertMany( [ newProps ], {}, function( err, docs ) {
			
			if ( err )
				throw err;

			//TODO: check for _ormosis, may be missing defaults may be in place
			if ( !obj._id )
				obj._id = docs.ops[0]._id;
			
			if ( fincb )
				fincb.apply( this, arguments );
			
		} );
	};
	
	this.wrapObj = function( obj ) {
		
		var orm = this;

		var np = new Proxy( obj, this.objModifyHandler );
		this.objProxies.push( np );
		return np;
	}
	
	this.wrapConstructor = function( theConFunc ) {
		
		
	}

	this.processQueue = function( meta ) {
		
		var collection = this.db.collection( meta.collection )
			orm = this;
		
		console.log( this.updateQueue );
		
		collection.bulkWrite( this.updateQueue, {}, function( e, r ) {
			
			var idArr = r.getInsertedIds();
			
			for ( var i = 0; i < idArr.length; i++ )
				orm.updateQObjMirr[ idArr[ i ].index ]._id = idArr[ i ]._id;
				
			orm.updateQueue = [];
			orm.updateQObjMirr = [];

		} );
	}	
	
	// this only deals w/ one object at a time
	this.objModifyHandler = {
		
		orm: this,	// instance ref. for handler methods
		
		get: function ( oTarget, sKey ) {
			
			return oTarget[sKey] || undefined;
		},
		
		set: function ( oTarget, sKey, vValue ) {
			
			var res = oTarget[ sKey ] = vValue;
			
			if ( sKey == "_id" )
				return res;
			
			// Using separate obj ref to delete _ormosis
			var newProps = {};			// TODO: change to object pool
			Object.assign( newProps, oTarget );
			delete newProps._ormosis;

			var upQ = this.orm.updateQueue;
			
			console.log( newProps );
			
			if ( !oTarget._id ) {		// TODO: optimize to not do this check on every obj write
			
				upQ.push( { insertOne: { document: newProps } } );
			
			} else {
				
				upQ.push( { updateOne: { filter: {_id: new mongodb.ObjectID(newProps._id) }, update: {$set: newProps}, upsert:true } } );
			}
			
			this.orm.updateQObjMirr.push( oTarget );
						
			this.orm.processQueue( oTarget._ormosis );
			
			return res;
		},
		
		deleteProperty: function ( oTarget, sKey ) {
			
			var unset = { $unset: {} };
			unset["$unset"][ sKey ] = "";
		
			this.orm.updateQueue.push( { updateOne: { filter: {_id: new mongodb.ObjectID(oTarget._id) }, update: unset } } );
			
			this.orm.processQueue( oTarget._ormosis );
			
			return delete oTarget[ sKey ];
		}
	}
}


module.exports = Ormosis;