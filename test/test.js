var assert = require('assert');
var MongoClient = require('mongodb').MongoClient

var ormosis = new require('../Ormosis');
var orm = new ormosis();

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


var tt = new SomeClass();
var p = orm.wrapObj( tt );
p.heyhey = "stuff";

describe('Classes', function() {

	describe( 'idField specified in _ormosis meta', function() {
		
		it( 'should simply save with eventual consistency', function( done ) {
			
			MongoClient.connect( testMongoUrl, {}, function( err, db ) {
				
				var testInst = new SomeClass();	
				
				testInst.b = "aaa";
				
				// Callback syntax shouldn't be necessary in actual usage
				orm.save( testInst, db, function() {
					
					var collection = db.collection('SomeClass');

					var filter = {};
					filter[ testInst._ormosis.idField ] = testInst[ testInst._ormosis.idField ];
				
					collection.findOne( filter, function( err, doc ) {
						
						if ( err )
							done( err );
						
						assert.equal( "undefined", typeof doc._ormosis );
						assert.equal( "aaa", doc.b );
						done( err );

        			} );
				} );
			} );
		});
	});
});