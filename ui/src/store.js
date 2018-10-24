import Vue from "vue";
import axios from "axios";
import Vuex from "vuex";

Vue.use(Vuex);
const api = axios.create({ baseURL: process.env.VUE_APP_API_URL });
export default new Vuex.Store({
  state: {
    breadcrumbs: []
  },
  mutations: {
    setBreadcrumbs(state, breadcrumbs) {
      state.breadcrumbs = breadcrumbs;
    }
  },
  actions: {
    async getDomains() {
      const { data } = await api.get("/domains");
      return data;
    },
    async setVersion(_, { domain, path, version }) {
      const { data } = await api.put(
        `/domains/${domain}/paths/${encodeURIComponent(path)}/version`,
        {
          version
        }
      );
      return data;
    },
    async getDomain(_, { domainName }) {
      const { data } = await api.get(`/domains/${domainName}`);
      if (data.length) {
        return data[0];
      }
      return data;
    }
  }
});
