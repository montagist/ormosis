var assert = require('assert');
var MongoClient = require('mongodb').MongoClient
var sleep = require('sleep')

var ormosis = new require('../Ormosis');
var orm = new ormosis();

var P = require("bluebird");

var testMongoUrl = 'mongodb://localhost:27017/myproject';

function SomeClass() {
	
	this.a = "1";
	this.b = "2";
	this.c = "3";
	
	this.someFunc = function( lbl ) {
		
		this[ lbl ]++;
	}
}

SomeClass.prototype._ormosis = { idField: "_id",
								 collection: "SomeClass",
								 db: "someDB" };

var db = null;

//TODO: timing tests

describe('Classes', function() {

	before(function(done) {
		
		MongoClient.connect( testMongoUrl, {}, function( err, cdb ) {
			
			db = cdb;
			done();
		} );
	} );

	after(function(done) {
		
		db.dropCollection( "SomeClass", function(e,r) { done(); } );
	} );


	describe( 'Simple case', function() {
		
		it( 'should save with eventual consistency on first update', function( done ) {

			var testInst = orm.wrapObj( new SomeClass() );
			
			console.time("property set");	
			testInst.b = "aaa";
			
			this.timeout( 30000 );
				
			var collection = db.collection('SomeClass');

			var checkAsserts = function() {
				
				if ( !testInst._id ) {
					console.log( "waiting..." );
					return;
				}
				
				console.timeEnd("property set");
				
				clearInterval( intervalId );
				
				collection.findOne( {_id: testInst._id}, function( err, doc ) {
				
					if ( err ) done( err );
					
					assert.equal( "undefined", typeof doc._ormosis );
					assert.equal( "aaa", doc.b );
					assert.notEqual( "undefined", typeof testInst );
					
					done( err );
				} );	
			};
			
			var intervalId = setInterval( checkAsserts, 10 );
		});
		
		it( 'should save after multiple updates', function( done ) {

			var testInst = orm.wrapObj( new SomeClass() );
			
			testInst.b = "aaa";
			console.time("property set");	
			testInst.b = "bbb";
			
			this.timeout( 30000 );
				
			var collection = db.collection('SomeClass');

			var checkAsserts = function() {
				
				if ( !testInst._id ) {
					console.log( "waiting..." );
					return;
				}
				
				console.timeEnd("property set");
				
				clearInterval( intervalId );
				
				collection.findOne( {_id: testInst._id}, function( err, doc ) {
				
					if ( err ) done( err );
					
					assert.equal( "bbb", doc.b );
					
					done( err );
				} );	
			};
			
			var intervalId = setInterval( checkAsserts, 10 );
		});
		
		it( 'should remove property from db document when deleted from object', function( done ) {

			var testInst = orm.wrapObj( new SomeClass() );
			console.time("property delete");
			testInst.b = "aaa";
			
			this.timeout( 10000 );
			
			var collection = db.collection('SomeClass');
			
			var checkAsserts = function() {
				
				if ( !testInst._id ) {
					console.log( "waiting..." );
					return;
				}
				
				console.timeEnd("property delete");
				clearInterval( intervalId );
				
				collection.findOne( {_id: testInst._id}, function( err, doc ) {
					
					if ( err ) done( err );
					
					assert.equal( "ccc", doc.b );
	
					done( err );
				} );	
			};
			
			var intervalId = setInterval( checkAsserts, 10 );
		});
	});
	
	describe( 'Promise use cases', function() {
		
		it( 'should return a promise when setting property on a class instance', function( done ) {

			var testInst = orm.wrapObj( new SomeClass() );
			
				
			( testInst.b = "aaa" );
			
			this.timeout( 30000 );
				
			var collection = db.collection('SomeClass');

			var checkAsserts = function() {
				
				if ( !testInst._id ) {
					console.log( "waiting..." );
					return;
				}
				
				console.timeEnd("property set");
				
				clearInterval( intervalId );
				
				collection.findOne( {_id: testInst._id}, function( err, doc ) {
				
					if ( err ) done( err );
					
					assert.equal( "undefined", typeof doc._ormosis );
					assert.equal( "aaa", doc.b );
					assert.notEqual( "undefined", typeof testInst );
					
					done( err );
				} );	
			};
			
			var intervalId = setInterval( checkAsserts, 10 );
		});
	
});