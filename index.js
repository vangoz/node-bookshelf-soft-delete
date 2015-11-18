'use strict';

function shouldDisable(opts) {
  if (typeof opts === 'undefined') return false;
  return opts && opts.hasOwnProperty('softDelete') && !opts.softDelete;
}

function addDeletionCheck(syncable, softFields) {
  var deletedAtField = softFields[0];
  var restoredAtField = softFields[1];

  /*eslint-disable no-underscore-dangle*/
  if (syncable._knex) {
    var table = syncable._knex._single.table;
    /*eslint-enable no-underscore-dangle*/

    deletedAtField = table + '.' + softFields[0];
    restoredAtField = table + '.' + softFields[1];
  }

  syncable.query(function (qb) {
    qb.where(function () {
      this.whereNull(deletedAtField).orWhereNotNull(restoredAtField);
    });
  });
}

module.exports = function (Bookshelf) {

  var mProto = Bookshelf.Model.prototype,
    cProto = Bookshelf.Collection.prototype;

  Bookshelf.Model = Bookshelf.Model.extend({

    softActivated: false,
    softFields: null,

    initialize: function () {
      if (Array.isArray(this.soft)) {
        this.softFields = this.soft;
        this.softActivated = true;
      } else if (this.soft === true) {
        this.softFields = ['deleted_at', 'restored_at']
        this.softActivated = true;
      }
      //console.log('initialize',this.tableName,this.soft,this.softActivated,this.softFields);
      return mProto.initialize.apply(this, arguments);
    },

    fetch: function (opts) {
      if (this.softActivated && !shouldDisable(opts)) {
        addDeletionCheck(this, this.softFields);
      }
      return mProto.fetch.apply(this, arguments);
    },

    fetchAll: function (opts) {
      if (this.softActivated && !shouldDisable(opts)) {
        addDeletionCheck(this, this.softFields);
      }
      return mProto.fetchAll.apply(this, arguments);
    },

    restore: function () {
      if (this.softActivated) {
        if (this.get(this.softFields[0])) {
          this.set(this.softFields[1], new Date());
          return this.save();
        }
      }
      else {
        throw new TypeError('restore cannont be used if the model does not ' +
        'have soft delete enabled');
      }
    },

    destroy: function (opts) {
      if (this.softActivated && !shouldDisable(opts)) {
        this.set(this.softFields[1], null);
        this.set(this.softFields[0], new Date());
        return this.save()
          .tap(function (model) {
            return model.triggerThen('destroying', model, opts);
          })
          .then(function (model) {
            return model.triggerThen('destroyed', model, undefined, opts);
          });
      } else {
        return mProto.destroy.apply(this, arguments);
      }
    }
  });

  Bookshelf.Collection = Bookshelf.Collection.extend({
    fetch: function (opts) {
      /*eslint-disable new-cap*/
      var model = new this.model();
      var softActivated = model.softActivated;
      var softFields = model.softFields;
      //console.log(this.model.prototype.tableName, softActivated, softFields, opts, shouldDisable(opts));
      /*eslint-enable new-cap*/
      if (softActivated && !shouldDisable(opts)) {
        addDeletionCheck(this, softFields);
      }
      return cProto.fetch.apply(this, arguments);
    },

    count: function (field, opts) {
      opts = opts || field;
      var model = new this.model();
      var softActivated = model.softActivated;
      var softFields = model.softFields;
      //console.log(this.model.prototype.tableName, softActivated, softFields, opts, shouldDisable(opts));
      if (softActivated && !shouldDisable(opts)) {
        addDeletionCheck(this, softFields);
      }

      return cProto.count.apply(this, arguments);
    }
  });
};
