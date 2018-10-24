import Vue from "vue";
import "./plugins/vuetify";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import "roboto-fontface/css/roboto/roboto-fontface.css";
import "material-design-icons-iconfont/dist/material-design-icons.css";
import moment from "moment";

Vue.config.productionTip = false;
Vue.filter("d", function(value) {
  if (value) {
    return moment(String(value)).format("MM/DD/YYYY HH:mm");
  }
});
new Vue({
  router,
  store,
  render: h => h(App)
}).$mount("#app");
