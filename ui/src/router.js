import Vue from "vue";
import Router from "vue-router";
import Home from "./views/Home.vue";
import DomainDetails from "./views/DomainDetails.vue";
import Versions from "./views/Versions.vue";
Vue.use(Router);

export default new Router({
  mode: "history",
  base: process.env.BASE_URL,
  routes: [
    {
      path: "/",
      name: "home",
      component: Home
    },
    {
      path: "/domains",
      name: "domains",
      component: Home
    },
    {
      path: "/domains/:domainName",
      name: "Domain-details",
      component: DomainDetails
    },
    {
      path: "/domains/:domainName/paths/:path/versions",
      name: "versions",
      component: Versions
    }
  ]
});
