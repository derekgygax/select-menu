{% load filters %}
"use strict";

jQuery(function($){
    // This creates an instance of the SelectMenus
    // Used to label and perform actions in the multiselect drop downs
    var select_menus = Object.create(SelectMenus);
    select_menus.setup(
        {{ content.facet_trail|dumps|safe }},
        {{ content.search.site.form_facets|dumps }},
        {{ options.form_facets|listdicts_to_dict:"field"|dumps }}
    );
    
    $(".filters-form").submit(function(){
        var form_data_array = $(this).serializeArray();
        var form_data_object = {};
        for (var i = 0; i < form_data_array.length; i++){
            var entry = form_data_array[i];
            if (form_data_object.hasOwnProperty(entry.name)){
                form_data_object[entry.name].push(entry.value);
            } else {
                form_data_object[entry.name] = [entry.value];
            }
        }
        select_menus.processMultiselectValues(form_data_object);
        return true;
    });
});